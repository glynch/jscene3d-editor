/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import type * as vscode from 'vscode';
import { DefinitionMutationValueDto, InspectorMutationTargetDto, InspectorSnapshotDto } from '../protocol/authoringProtocol';
import { InspectorState, InspectorStateSnapshot } from './inspectorState';
import { inspectorSearchIndex } from './inspectorViewModel';
import { acceptsPropertyEditorCandidate, resolvePropertyEditor } from './propertyEditorResolver';

export const inspectorViewId = 'jscene3d.inspector';
export const inspectorFocusCommandId = `${inspectorViewId}.focus`;

export type InspectorInboundMessage =
	| { readonly type: 'selectGroup'; readonly groupId: string }
	| { readonly type: 'prepareForDocumentCloseResult'; readonly requestId: number; readonly accepted: boolean }
	| {
		readonly type: 'editProperty'; readonly groupId: string; readonly propertyId: string;
		readonly candidate: DefinitionMutationValueDto;
	};
export type InspectorTranslate = (message: string, ...args: string[]) => string;
export type InspectorCommandExecutor = (command: string) => PromiseLike<unknown> | unknown;

export interface InspectorMutationHandler {
	mutate(target: InspectorMutationTargetDto, candidate: DefinitionMutationValueDto, label: string): Promise<void>;
}

/** Activates the Inspector's Secondary Side Bar container through Code OSS's generated view command. */
export async function revealInspector(executeCommand: InspectorCommandExecutor): Promise<void> {
	await executeCommand(inspectorFocusCommandId);
}

/** Presents the complete Inspector snapshot without owning semantic selection or domain rules. */
export class InspectorViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private lastInspector: object | undefined;
	private readonly stateSubscription: { dispose(): void };
	private messageSubscription: vscode.Disposable | undefined;
	private closePreparationSequence = 0;
	private readonly closePreparations = new Map<number, (accepted: boolean) => void>();

	constructor(
		private readonly state: InspectorState,
		private readonly language: string,
		private readonly translate: InspectorTranslate,
		private readonly mutations?: InspectorMutationHandler
	) {
		this.stateSubscription = state.onDidChange(() => this.render());
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = { enableScripts: true };
		this.messageSubscription?.dispose();
		this.messageSubscription = view.webview.onDidReceiveMessage(message => this.acceptMessage(message));
		view.onDidDispose(() => {
			if (this.view === view) {
				this.view = undefined;
				this.lastInspector = undefined;
				this.messageSubscription?.dispose();
				this.messageSubscription = undefined;
				this.completeClosePreparations(false);
			}
		});
		this.render(true);
	}

	/** Commits valid pending scalar input or rejects the lifecycle action while local input is invalid. */
	prepareForDocumentClose(): Promise<boolean> {
		const view = this.view;
		if (view === undefined) {
			return Promise.resolve(true);
		}
		const requestId = ++this.closePreparationSequence;
		return new Promise<boolean>(resolve => {
			let completed = false;
			const complete = (accepted: boolean) => {
				if (completed) {
					return;
				}
				completed = true;
				clearTimeout(timeout);
				this.closePreparations.delete(requestId);
				resolve(accepted);
			};
			const timeout = setTimeout(() => complete(false), 2000);
			this.closePreparations.set(requestId, complete);
			void Promise.resolve(view.webview.postMessage({ type: 'prepareForDocumentClose', requestId })).then(
				delivered => {
					if (!delivered) {
						complete(true);
					}
				},
				() => complete(false)
			);
		});
	}

	dispose(): void {
		this.stateSubscription.dispose();
		this.messageSubscription?.dispose();
		this.completeClosePreparations(false);
		this.view = undefined;
		this.lastInspector = undefined;
	}

	private acceptMessage(value: unknown): void {
		if (!isInspectorMessage(value)) {
			return;
		}
		if (value.type === 'prepareForDocumentCloseResult') {
			this.closePreparations.get(value.requestId)?.(value.accepted);
			return;
		}
		if (value.type === 'editProperty') {
			void this.acceptMutation(value);
			return;
		}
		try {
			this.state.selectGroup(value.groupId);
		} catch {
			// A stale webview message is ignored; the next state render is authoritative.
		}
	}

	private async acceptMutation(message: Extract<InspectorInboundMessage, { readonly type: 'editProperty' }>): Promise<void> {
		const snapshot = this.state.snapshot;
		const property = snapshot.status === 'ready'
			? snapshot.inspector.groups.find(group => group.identity === message.groupId)
				?.properties.find(candidate => candidate.identity === message.propertyId)
			: undefined;
		if (property?.mutationTarget === null || property?.mutationTarget === undefined || !property.state.editable
			|| !acceptsPropertyEditorCandidate(property, message.candidate)) {
			this.render(true);
			return;
		}
		try {
			await this.mutations?.mutate(property.mutationTarget, message.candidate, `Edit ${property.label}`);
		} finally {
			this.render(true);
		}
	}

	private render(force = false): void {
		const view = this.view;
		if (view === undefined) {
			return;
		}
		const snapshot = this.state.snapshot;
		if (!force && snapshot.status === 'ready' && this.lastInspector === snapshot.inspector) {
			void view.webview.postMessage({ type: 'focusGroup', groupId: snapshot.selectedGroupId });
			return;
		}
		this.lastInspector = snapshot.status === 'ready' ? snapshot.inspector : undefined;
		view.webview.html = inspectorHtml(view.webview.cspSource, snapshot, this.language, this.translate);
	}

	private completeClosePreparations(accepted: boolean): void {
		for (const complete of Array.from(this.closePreparations.values())) {
			complete(accepted);
		}
	}
}

export function isInspectorMessage(value: unknown): value is InspectorInboundMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const message = value as Record<string, unknown>;
	if (message.type === 'selectGroup') {
		return typeof message.groupId === 'string'
			&& message.groupId.length > 0
			&& Object.keys(message).every(key => key === 'type' || key === 'groupId');
	}
	if (message.type === 'prepareForDocumentCloseResult') {
		return typeof message.requestId === 'number'
			&& Number.isSafeInteger(message.requestId) && message.requestId > 0
			&& typeof message.accepted === 'boolean'
			&& Object.keys(message).every(key => key === 'type' || key === 'requestId' || key === 'accepted');
	}
	return message.type === 'editProperty'
		&& typeof message.groupId === 'string' && message.groupId.length > 0
		&& typeof message.propertyId === 'string' && message.propertyId.length > 0
		&& isMutationCandidate(message.candidate)
		&& Object.keys(message).every(key => key === 'type' || key === 'groupId' || key === 'propertyId' || key === 'candidate');
}

function isMutationCandidate(value: unknown): value is DefinitionMutationValueDto {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (candidate.kind === 'boolean') {
		return typeof candidate.value === 'boolean'
			&& Object.keys(candidate).every(key => key === 'kind' || key === 'value');
	}
	return (candidate.kind === 'integer' || candidate.kind === 'number' || candidate.kind === 'text')
		&& typeof candidate.literal === 'string'
		&& Object.keys(candidate).every(key => key === 'kind' || key === 'literal');
}

/** Creates one restrictive, self-contained webview document. */
export function inspectorHtml(
	cspSource: string,
	state: InspectorStateSnapshot,
	language: string,
	translate: InspectorTranslate
): string {
	const nonce = randomBytes(16).toString('base64');
	const bootstrap = webviewBootstrap(state, translate);
	return `<!DOCTYPE html>
<html lang="${escapeAttribute(language)}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${escapeAttribute(cspSource)} data:;">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style nonce="${nonce}">${styles}</style>
</head>
<body>
	<main id="app" aria-live="polite"></main>
	<script nonce="${nonce}">const bootstrap = ${safeJson(bootstrap)};${clientScript}</script>
</body>
</html>`;
}

function webviewBootstrap(state: InspectorStateSnapshot, translate: InspectorTranslate): object {
	const strings = {
		empty: translate('Select an entity in the Hierarchy to inspect it.'),
		loading: translate('Loading Inspector…'),
		rejected: translate('Inspector data is unavailable.'),
		filterPlaceholder: translate('Filter components and properties…'),
		filterOptions: translate('Filter options'),
		noFilterOptions: translate('No additional filters are available yet.'),
		noResults: translate('No matching components or properties.'),
		properties: translate('Properties'),
		readOnly: translate('Read-only'),
		unset: translate('Unset'),
		required: translate('Required'),
		broken: translate('Broken reference'),
		metadataUnavailable: translate('Descriptor metadata unavailable'),
		resolved: translate('Resolved'),
		trueValue: translate('True'),
		falseValue: translate('False'),
		invalidInteger: translate('Invalid integer'),
		invalidNumber: translate('Invalid number'),
		modified: translate('Modified since last save'),
		items: translate('{0} items', '{count}'),
		fields: translate('{0} fields', '{count}')
	};
	return state.status === 'ready'
		? {
			status: state.status,
			snapshot: inspectorPresentationSnapshot(state.inspector),
			selectedGroupId: state.selectedGroupId,
			searchIndex: inspectorSearchIndex(state.inspector),
			strings
		}
		: state.status === 'rejected'
			? { status: state.status, failureCode: state.failureCode, strings }
			: { status: state.status, strings };
}

/** Adds built-in read-only presentation models without changing the authoritative snapshot. */
function inspectorPresentationSnapshot(snapshot: InspectorSnapshotDto): object {
	return {
		...snapshot,
		groups: snapshot.groups.map(group => ({
			...group,
			properties: group.properties.map(property => ({
				...property,
				propertyEditor: resolvePropertyEditor(property)
			}))
		}))
	};
}

function safeJson(value: object): string {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const styles = `
:root { --navigator-size: 42%; color-scheme: light dark; }
* { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; margin: 0; padding: 0; }
body { color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: var(--vscode-font-size) var(--vscode-font-family); }
button, input { font: inherit; }
.message { padding: 16px; color: var(--vscode-descriptionForeground); }
.shell { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(80px, var(--navigator-size)) 5px minmax(100px, 1fr); }
.header { padding: 10px 12px 7px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); }
.header-row { display: flex; gap: 8px; align-items: center; }
.title { min-width: 0; flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subtitle { margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 0.9em; text-transform: capitalize; }
.filter-row { display: flex; gap: 4px; margin-top: 8px; }
.search-input { min-width: 0; height: 26px; flex: 1; border: 1px solid var(--vscode-input-border); padding: 3px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); }
.search-input:focus, .filter-button:focus, .search-result:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.filter-options { position: relative; }
.filter-button { width: 28px; height: 26px; display: grid; place-items: center; border: 1px solid transparent; padding: 4px; color: var(--vscode-icon-foreground); background: var(--vscode-button-secondaryBackground); cursor: pointer; }
.filter-button:hover { background: var(--vscode-button-secondaryHoverBackground); }
.filter-button svg { width: 16px; height: 16px; fill: currentColor; }
.filter-menu { position: absolute; z-index: 4; top: 29px; right: 0; width: max-content; max-width: 240px; padding: 5px 8px; color: var(--vscode-menu-foreground); background: var(--vscode-menu-background); border: 1px solid var(--vscode-menu-border); box-shadow: 0 3px 8px var(--vscode-widget-shadow); }
.filter-menu[hidden], .search-results[hidden], .navigator-scroll[hidden] { display: none; }
.filter-menu-empty { color: var(--vscode-disabledForeground); }
.search-results { min-height: 0; overflow: auto; padding: 6px 0; }
.search-result { width: 100%; border: 0; padding: 5px 10px; text-align: left; color: var(--vscode-foreground); background: transparent; cursor: pointer; }
.search-result:hover, .search-result:focus { background: var(--vscode-list-hoverBackground); }
.search-primary { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-context { display: block; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
.navigator-scroll, .property-scroll { min-height: 0; overflow: auto; }
.navigator-scroll { padding: 6px 0; }
.group { width: 100%; display: flex; gap: 8px; align-items: center; border: 0; border-left: 2px solid transparent; padding: 4px 10px; text-align: left; color: var(--vscode-foreground); background: transparent; cursor: pointer; }
.group:hover { background: var(--vscode-list-hoverBackground); }
.group.active { border-left-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.group-label { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warning { color: var(--vscode-problemsWarningIcon-foreground); }
.divider { cursor: row-resize; background: var(--vscode-sideBarSectionHeader-border); }
.divider:hover, .divider.dragging { background: var(--vscode-focusBorder); }
.property-scroll { padding: 0 10px 12px; }
.property-heading { position: sticky; top: 0; z-index: 2; margin: 0 -10px 6px; padding: 8px 10px 6px; background: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); font-weight: 600; text-transform: uppercase; }
.group-description { margin: 0 0 8px; color: var(--vscode-descriptionForeground); }
.property { display: grid; grid-template-columns: minmax(80px, 42%) minmax(0, 1fr); gap: 8px; padding: 5px 0; border-bottom: 1px solid color-mix(in srgb, var(--vscode-sideBarSectionHeader-border) 55%, transparent); }
.property.modified { border-left: 2px solid var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder)); padding-left: 6px; background: color-mix(in srgb, var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder)) 7%, transparent); }
.property:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.property-label { min-width: 0; color: var(--vscode-foreground); }
.property-value { min-width: 0; text-align: right; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); user-select: text; }
.property-input { width: 100%; min-width: 0; border: 1px solid var(--vscode-input-border); padding: 2px 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); }
.property-input.validation-error { border-color: var(--vscode-inputValidation-errorBorder); outline-color: var(--vscode-inputValidation-errorBorder); }
.property-validation { margin-top: 2px; color: var(--vscode-inputValidation-errorForeground); font-size: 0.85em; line-height: 1.2; text-align: left; }
.property-validation[hidden] { display: none; }
.property-checkbox { accent-color: var(--vscode-checkbox-selectBackground); }
.property.block { display: block; }
.property.block .property-value { margin-top: 4px; text-align: left; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
.property-disclosure { width: 100%; display: grid; grid-template-columns: auto minmax(72px, 42%) minmax(0, 1fr); gap: 4px; align-items: center; border: 0; padding: 0; color: var(--vscode-foreground); background: transparent; text-align: left; cursor: pointer; }
.property-disclosure:hover { background: var(--vscode-list-hoverBackground); }
.property-disclosure:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.property-disclosure-icon { width: 1em; color: var(--vscode-icon-foreground); text-align: center; }
.property-disclosure-summary { min-width: 0; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); text-align: right; overflow-wrap: anywhere; user-select: text; }
.property-components { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
.property-component { min-width: 0; max-width: 100%; display: inline-flex; flex: 0 1 auto; gap: 4px; align-items: center; }
.property-component-label { color: var(--vscode-descriptionForeground); font-family: var(--vscode-font-family); font-size: 0.9em; font-weight: 400; }
.property-component-value { min-width: 48px; width: max-content; max-width: 24ch; box-sizing: border-box; padding: 2px 5px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); text-align: right; overflow-wrap: anywhere; }
.badges { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.badge { padding: 1px 4px; border-radius: 2px; font-size: 0.8em; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
.badge.problem { color: var(--vscode-inputValidation-errorForeground); background: var(--vscode-inputValidation-errorBackground); }
`;

const clientScript = `
const vscode = acquireVsCodeApi();
const app = document.getElementById('app');
if (bootstrap.status !== 'ready') {
	app.className = 'message';
	app.textContent = bootstrap.status === 'loading' ? bootstrap.strings.loading
		: bootstrap.status === 'rejected' ? bootstrap.strings.rejected : bootstrap.strings.empty;
} else {
	const snapshot = bootstrap.snapshot;
	app.innerHTML = '<section class="shell"><header class="header"><div class="header-row"><div class="title"></div></div><div class="subtitle"></div><div class="filter-row"><input class="search-input" type="search" aria-controls="inspector-search-results"><div class="filter-options"><button class="filter-button" type="button" aria-haspopup="menu" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M1.5 3h13L9.5 8.6V13l-3 1V8.6L1.5 3z"></path></svg></button><div class="filter-menu" role="menu" hidden><div class="filter-menu-empty" role="menuitem" aria-disabled="true"></div></div></div></div></header><nav class="navigator-scroll"></nav><div id="inspector-search-results" class="search-results" aria-live="polite" hidden></div><div class="divider" role="separator" aria-orientation="horizontal" tabindex="0"></div><section class="property-scroll"></section></section>';
	const shell = app.querySelector('.shell');
	const title = app.querySelector('.title');
	const subtitle = app.querySelector('.subtitle');
	const searchInput = app.querySelector('.search-input');
	const searchResults = app.querySelector('.search-results');
	const filterOptions = app.querySelector('.filter-options');
	const filterButton = app.querySelector('.filter-button');
	const filterMenu = app.querySelector('.filter-menu');
	const filterMenuEmpty = app.querySelector('.filter-menu-empty');
	const navigator = app.querySelector('.navigator-scroll');
	const properties = app.querySelector('.property-scroll');
	const divider = app.querySelector('.divider');
	title.textContent = snapshot.title;
	subtitle.textContent = snapshot.target.kind.replaceAll('-', ' ') + (snapshot.editable ? '' : ' · ' + bootstrap.strings.readOnly);
	searchInput.setAttribute('placeholder', bootstrap.strings.filterPlaceholder);
	searchInput.setAttribute('aria-label', bootstrap.strings.filterPlaceholder);
	filterButton.setAttribute('aria-label', bootstrap.strings.filterOptions);
	filterButton.setAttribute('title', bootstrap.strings.filterOptions);
	filterMenuEmpty.textContent = bootstrap.strings.noFilterOptions;
	const savedState = vscode.getState();
	searchInput.value = typeof savedState?.query === 'string' ? savedState.query : '';
	const collapsedProperties = new Set(Array.isArray(savedState?.collapsedProperties)
		? savedState.collapsedProperties.filter(value => typeof value === 'string') : []);
	let selectedGroupId = bootstrap.selectedGroupId;
	let validationSequence = 0;
	const numericEditors = new Set();
	const pendingNumericEditors = new Set();

	function savePresentationState() {
		vscode.setState({ query: searchInput.value, collapsedProperties: Array.from(collapsedProperties) });
	}

	function collapseKey(groupId, propertyId) {
		const occurrence = snapshot.target.occurrence;
		return JSON.stringify([
			snapshot.target.kind, snapshot.target.source, snapshot.target.identity,
			occurrence?.definitionAssetId ?? null, occurrence?.entityPath ?? null,
			groupId, propertyId
		]);
	}

	function selectGroup(groupId, propertyId, notify = true) {
		if (!snapshot.groups.some(group => group.identity === groupId)) { return; }
		selectedGroupId = groupId;
		for (const button of navigator.querySelectorAll('.group')) {
			button.classList.toggle('active', button.dataset.groupId === groupId);
		}
		renderProperties(propertyId);
		if (notify) { vscode.postMessage({ type: 'selectGroup', groupId }); }
	}

	for (const group of snapshot.groups) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'group';
		button.dataset.groupId = group.identity;
		const label = document.createElement('span');
		label.className = 'group-label';
		label.textContent = group.label;
		button.append(label);
		if (group.metadataStatus === 'unavailable') {
			const warning = document.createElement('span');
			warning.className = 'warning'; warning.textContent = '⚠';
			warning.title = bootstrap.strings.metadataUnavailable; button.append(warning);
		}
		button.addEventListener('click', () => selectGroup(group.identity));
		navigator.append(button);
	}

	function renderProperties(propertyId) {
		for (const editor of numericEditors) { editor.dispose(); }
		numericEditors.clear();
		pendingNumericEditors.clear();
		properties.replaceChildren();
		const group = snapshot.groups.find(candidate => candidate.identity === selectedGroupId);
		if (!group) { return; }
		const heading = document.createElement('h2'); heading.className = 'property-heading'; heading.textContent = group.label;
		properties.append(heading);
		if (group.description) { const description = document.createElement('p'); description.className = 'group-description'; description.textContent = group.description; properties.append(description); }
		for (const property of group.properties) {
			const row = document.createElement('div'); row.className = 'property'; row.tabIndex = -1; row.dataset.propertyId = property.identity;
			if (property.state.modified) { row.classList.add('modified'); row.title = bootstrap.strings.modified; }
			row.dataset.editorKind = property.propertyEditor.kind;
			if (isBlockEditor(property.propertyEditor)) { row.classList.add('block'); }
			const value = document.createElement('div'); value.className = 'property-value'; renderPropertyEditor(value, property.propertyEditor, group.identity, property.identity);
			if (property.propertyEditor.collapsible === true) {
				renderCompoundProperty(row, value, group.identity, property);
			} else {
				const label = document.createElement('div'); label.className = 'property-label'; label.textContent = property.label; if (property.description) { label.title = property.description; }
				row.append(label, value);
			}
			const badges = propertyBadges(property);
			if (badges.length) { const box = document.createElement('div'); box.className = 'badges'; for (const badge of badges) { const item = document.createElement('span'); item.className = 'badge' + (badge.problem ? ' problem' : ''); item.textContent = badge.text; box.append(item); } row.append(box); }
			properties.append(row);
		}
		if (propertyId) { const row = Array.from(properties.querySelectorAll('.property')).find(candidate => candidate.dataset.propertyId === propertyId); if (row) { row.scrollIntoView({ block: 'center' }); row.focus(); } }
	}

	function renderCompoundProperty(row, value, groupId, property) {
		const key = collapseKey(groupId, property.identity);
		const disclosure = document.createElement('button'); disclosure.type = 'button'; disclosure.className = 'property-disclosure';
		const icon = document.createElement('span'); icon.className = 'property-disclosure-icon'; icon.setAttribute('aria-hidden', 'true');
		const label = document.createElement('span'); label.className = 'property-label'; label.textContent = property.label; if (property.description) { label.title = property.description; }
		const summary = document.createElement('span'); summary.className = 'property-disclosure-summary'; summary.textContent = property.propertyEditor.summary;
		disclosure.append(icon, label, summary); row.append(disclosure, value);
		function setExpanded(expanded, persist) {
			disclosure.setAttribute('aria-expanded', String(expanded));
			icon.textContent = expanded ? '▾' : '▸';
			summary.hidden = expanded;
			value.hidden = !expanded;
			if (persist) {
				if (expanded) { collapsedProperties.delete(key); } else { collapsedProperties.add(key); }
				savePresentationState();
			}
		}
		setExpanded(!collapsedProperties.has(key), false);
		disclosure.addEventListener('click', () => setExpanded(disclosure.getAttribute('aria-expanded') !== 'true', true));
	}

	function propertyBadges(property) {
		const badges = [];
		if (property.state.origin === 'unset') { badges.push({ text: property.required ? bootstrap.strings.required : bootstrap.strings.unset, problem: property.required }); }
		if (property.state.validity === 'broken-reference') { badges.push({ text: bootstrap.strings.broken, problem: true }); }
		if (property.state.validity === 'metadata-unavailable') { badges.push({ text: bootstrap.strings.metadataUnavailable }); }
		return badges;
	}

	function isBlockEditor(editor) {
		return editor.collapsible === true
			|| editor.kind === 'collectionSummary' || editor.kind === 'objectSummary';
	}

	function renderPropertyEditor(container, editor, groupId, propertyId) {
		switch (editor.kind) {
			case 'boolean': {
				if (!editor.editable) { container.textContent = editor.value === null ? '—' : editor.value ? bootstrap.strings.trueValue : bootstrap.strings.falseValue; return; }
				const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'property-checkbox'; input.checked = editor.value === true;
				input.addEventListener('change', () => vscode.postMessage({ type: 'editProperty', groupId, propertyId, candidate: { kind: 'boolean', value: input.checked } }));
				container.append(input); return;
			}
			case 'decimal':
			case 'integer': {
				if (!editor.editable) { container.textContent = editor.decimal ?? '—'; return; }
				const input = document.createElement('input'); input.type = 'text'; input.className = 'property-input'; input.value = editor.decimal ?? '';
				input.inputMode = editor.kind === 'integer' ? 'numeric' : 'decimal';
				const complete = new RegExp(editor.completePattern); const intermediate = new RegExp(editor.intermediatePattern);
				const validation = document.createElement('div'); validation.className = 'property-validation'; validation.hidden = true;
				validation.id = 'property-validation-' + ++validationSequence;
				input.setAttribute('aria-describedby', validation.id);
				input.setAttribute('aria-invalid', 'false');
				let committedValue = input.value;
				let commitTimer;
				function status() {
					return complete.test(input.value) ? 'complete' : intermediate.test(input.value) ? 'intermediate' : 'invalid';
				}
				function showValidation(show) {
					input.classList.toggle('validation-error', show);
					input.setAttribute('aria-invalid', String(show));
					validation.textContent = show ? (editor.kind === 'integer' ? bootstrap.strings.invalidInteger : bootstrap.strings.invalidNumber) : '';
					validation.hidden = !show;
				}
				function commitNumericInput(reportInvalid) {
					clearTimeout(commitTimer);
					const currentStatus = status();
					if (currentStatus !== 'complete') {
						showValidation(reportInvalid || currentStatus === 'invalid');
						pendingNumericEditors.add(controller);
						return false;
					}
					showValidation(false);
					if (input.value === committedValue) {
						pendingNumericEditors.delete(controller);
						return true;
					}
					committedValue = input.value;
					pendingNumericEditors.delete(controller);
					vscode.postMessage({ type: 'editProperty', groupId, propertyId, candidate: { kind: editor.kind === 'integer' ? 'integer' : 'number', literal: input.value } });
					return true;
				}
				const controller = {
					commit: () => commitNumericInput(true),
					focus: () => input.focus(),
					dispose: () => clearTimeout(commitTimer)
				};
				numericEditors.add(controller);
				input.addEventListener('input', () => {
					clearTimeout(commitTimer);
					const currentStatus = status();
					showValidation(currentStatus === 'invalid');
					if (input.value === committedValue) {
						pendingNumericEditors.delete(controller);
						return;
					}
					pendingNumericEditors.add(controller);
					if (currentStatus === 'complete') {
						commitTimer = setTimeout(() => commitNumericInput(false), 250);
					}
				});
				input.addEventListener('change', () => commitNumericInput(true));
				input.addEventListener('keydown', event => {
					if (event.key === 'Enter') { commitNumericInput(true); }
				});
				container.append(input, validation); return;
			}
			case 'text': {
				if (!editor.editable) { container.textContent = editor.value ?? '—'; return; }
				const input = document.createElement('input'); input.type = 'text'; input.className = 'property-input'; input.value = editor.value ?? '';
				input.addEventListener('change', () => vscode.postMessage({ type: 'editProperty', groupId, propertyId, candidate: { kind: 'text', literal: input.value } }));
				container.append(input); return;
			}
			case 'vector2':
			case 'vector3':
			case 'eulerRotation':
			case 'quaternion':
			case 'linearColor': renderComponents(container, editor); return;
			case 'reference': container.textContent = semanticLabel(editor.label, editor.resolution); return;
			case 'entityTarget': container.textContent = semanticLabel(editor.label, editor.resolution); return;
			case 'componentTarget': {
				const label = editor.entityLabel === null || editor.componentLabel === null
					? null : editor.entityLabel + ' · ' + editor.componentLabel;
				container.textContent = semanticLabel(label, editor.resolution); return;
			}
			case 'collectionSummary': container.textContent = editor.count === null ? '—' : bootstrap.strings.items.replace('{count}', String(editor.count)); return;
			case 'objectSummary': container.textContent = editor.count === null ? '—' : bootstrap.strings.fields.replace('{count}', String(editor.count)); return;
			case 'fallback': container.textContent = editor.value === 'null' ? 'null' : '—'; return;
		}
	}

	function renderComponents(container, editor) {
		const components = document.createElement('div'); components.className = 'property-components';
		for (const component of editor.components) {
			const item = document.createElement('div'); item.className = 'property-component';
			const label = document.createElement('span'); label.className = 'property-component-label'; label.textContent = component.label;
			const value = document.createElement('span'); value.className = 'property-component-value';
			value.textContent = component.decimal === null ? '—' : component.decimal + (editor.unit === 'degrees' ? '°' : '');
			item.append(label, value); components.append(item);
		}
		container.append(components);
	}

	function semanticLabel(label, resolution) {
		return label === null ? '—' : label + (resolution === 'broken' ? ' · ' + bootstrap.strings.broken : '');
	}

	function updateSearch() {
		searchResults.replaceChildren();
		const query = searchInput.value.trim().toLocaleLowerCase();
		savePresentationState();
		navigator.hidden = query.length > 0;
		searchResults.hidden = query.length === 0;
		if (!query) { return; }
		const results = bootstrap.searchIndex.filter(result => result.label.toLocaleLowerCase().includes(query));
		if (!results.length) { const empty = document.createElement('div'); empty.className = 'message'; empty.textContent = bootstrap.strings.noResults; searchResults.append(empty); return; }
		for (const result of results) {
			const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result';
			const primary = document.createElement('span'); primary.className = 'search-primary'; primary.textContent = result.kind === 'property' ? result.groupLabel : result.label; button.append(primary);
			if (result.kind === 'property') { const context = document.createElement('span'); context.className = 'search-context'; context.textContent = result.label; button.append(context); }
			button.addEventListener('click', () => selectGroup(result.groupId, result.propertyId));
			searchResults.append(button);
		}
	}
	searchInput.addEventListener('input', updateSearch);
	searchInput.addEventListener('keydown', event => { if (event.key === 'Escape' && searchInput.value) { searchInput.value = ''; updateSearch(); } });
	filterButton.addEventListener('click', () => { const open = filterMenu.hidden; filterMenu.hidden = !open; filterButton.setAttribute('aria-expanded', String(open)); });
	document.addEventListener('click', event => { if (!filterOptions.contains(event.target)) { filterMenu.hidden = true; filterButton.setAttribute('aria-expanded', 'false'); } });
	document.addEventListener('keydown', event => { if (event.key === 'Escape' && !filterMenu.hidden) { filterMenu.hidden = true; filterButton.setAttribute('aria-expanded', 'false'); filterButton.focus(); } });

	let dragging = false;
	divider.addEventListener('pointerdown', event => { dragging = true; divider.classList.add('dragging'); divider.setPointerCapture(event.pointerId); });
	divider.addEventListener('pointermove', event => { if (!dragging) { return; } const bounds = shell.getBoundingClientRect(); const headerHeight = app.querySelector('.header').getBoundingClientRect().height; const available = bounds.height - headerHeight - 5; const size = Math.max(80, Math.min(available - 100, event.clientY - bounds.top - headerHeight)); shell.style.setProperty('--navigator-size', size + 'px'); });
	divider.addEventListener('pointerup', event => { dragging = false; divider.classList.remove('dragging'); divider.releasePointerCapture(event.pointerId); });
	window.addEventListener('message', event => {
		if (event.data?.type === 'focusGroup' && typeof event.data.groupId === 'string' && event.data.groupId !== selectedGroupId) {
			selectGroup(event.data.groupId, undefined, false);
			return;
		}
		if (event.data?.type === 'prepareForDocumentClose' && Number.isSafeInteger(event.data.requestId)) {
			let accepted = true;
			for (const editor of Array.from(pendingNumericEditors)) {
				if (!editor.commit()) {
					editor.focus();
					accepted = false;
					break;
				}
			}
			vscode.postMessage({ type: 'prepareForDocumentCloseResult', requestId: event.data.requestId, accepted });
		}
	});
	selectGroup(selectedGroupId, undefined, false);
	updateSearch();
}
`;
