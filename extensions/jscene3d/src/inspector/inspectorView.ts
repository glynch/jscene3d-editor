/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import type * as vscode from 'vscode';
import { DefinitionMutationValueDto, InspectorMutationTargetDto, InspectorSnapshotDto } from '../protocol/authoringProtocol';
import { InspectorState, InspectorStateSnapshot } from './inspectorState';
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

	get visible(): boolean {
		return this.view?.visible ?? false;
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
		inspector: translate('Inspector'),
		empty: translate('No entity selected'),
		emptyDetail: translate('Select an entity in the Hierarchy or Scene View to inspect its components.'),
		loading: translate('Loading Inspector…'),
		rejected: translate('Inspector data is unavailable.'),
		readOnly: translate('Read-only'),
		entityName: translate('Entity name'),
		enabled: translate('Enabled'),
		static: translate('Static'),
		tag: translate('Tag'),
		untagged: translate('Untagged'),
		layer: translate('Layer'),
		defaultLayer: translate('Default'),
		deferred: translate('Not available yet'),
		componentHelp: translate('Component help'),
		componentSettings: translate('Component settings'),
		componentActions: translate('Component actions'),
		addComponent: translate('Add Component'),
		chooseResource: translate('Choose resource'),
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
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; margin: 0; padding: 0; }
body { overflow: hidden; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: var(--vscode-font-size) var(--vscode-font-family); }
button, input, select { font: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.message-shell { height: 100%; display: grid; place-items: center; padding: 28px; text-align: center; }
.message-content { max-width: 260px; color: var(--vscode-descriptionForeground); }
.message-icon { width: 42px; height: 42px; margin: 0 auto 12px; color: var(--vscode-disabledForeground); }
.message-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.25; }
.message-title { margin: 0 0 6px; color: var(--vscode-foreground); font-size: 1.05em; font-weight: 600; }
.message-detail { margin: 0; line-height: 1.45; }
.inspector-shell { height: 100%; min-height: 0; display: grid; grid-template-rows: 35px minmax(0, 1fr); }
.inspector-toolbar { display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); background: var(--vscode-sideBarSectionHeader-background); }
.inspector-title { min-width: 0; flex: 1; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.inspector-readonly { color: var(--vscode-descriptionForeground); font-size: .86em; }
.inspector-menu, .component-action, .resource-action { display: grid; place-items: center; border: 0; color: var(--vscode-icon-foreground); background: transparent; }
.inspector-menu { width: 24px; height: 24px; font-size: 18px; }
.inspector-menu:disabled, .component-action:disabled, .resource-action:disabled { opacity: .62; }
.inspector-scroll { min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 10px 10px 18px; }
.entity-card { padding: 2px 2px 12px; }
.entity-primary { display: grid; grid-template-columns: 26px auto minmax(70px, 1fr) auto; gap: 7px; align-items: center; }
.entity-icon, .component-icon { display: grid; place-items: center; color: var(--vscode-icon-foreground); }
.entity-icon { width: 24px; height: 24px; }
.entity-icon svg, .component-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
.entity-name, .property-input, .deferred-select, .resource-field, .property-component-value { min-width: 0; height: 24px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); }
.entity-name { width: 100%; padding: 2px 6px; font-weight: 600; }
.entity-name[readonly] { color: var(--vscode-foreground); }
.check-label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.property-checkbox, .deferred-checkbox { width: 15px; height: 15px; margin: 0; accent-color: var(--vscode-checkbox-selectBackground); }
.deferred-control { color: var(--vscode-disabledForeground); }
.entity-metadata { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 6px 8px; align-items: center; margin-top: 10px; }
.metadata-label { color: var(--vscode-descriptionForeground); }
.deferred-select { width: 100%; padding: 1px 24px 1px 6px; color: var(--vscode-disabledForeground); }
.component-stack { display: grid; gap: 8px; }
.component-card { overflow: hidden; border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 3px; background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-editor-background)); }
.component-card[open] { box-shadow: 0 1px 2px color-mix(in srgb, var(--vscode-widget-shadow) 35%, transparent); }
.component-header { min-height: 34px; display: grid; grid-template-columns: 12px 20px minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 4px 5px 4px 7px; color: var(--vscode-foreground); background: var(--vscode-sideBarSectionHeader-background); cursor: pointer; list-style: none; }
.component-header::-webkit-details-marker { display: none; }
.component-disclosure { color: var(--vscode-icon-foreground); font-size: 10px; transform: rotate(-90deg); transition: transform 90ms ease; }
.component-card[open] .component-disclosure { transform: rotate(0deg); }
.component-icon { width: 18px; height: 18px; }
.component-name { min-width: 0; overflow: hidden; font-size: .96em; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.component-actions { display: flex; align-items: center; }
.component-action { width: 23px; height: 23px; padding: 3px; border-radius: 2px; font-size: 14px; }
.component-action:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
.component-body { padding: 6px 8px 9px; border-top: 1px solid color-mix(in srgb, var(--vscode-sideBarSectionHeader-border) 65%, transparent); }
.component-description { margin: 0 0 7px; color: var(--vscode-descriptionForeground); font-size: .9em; line-height: 1.35; }
.component-warning { margin: 0 0 7px; color: var(--vscode-problemsWarningIcon-foreground); font-size: .9em; }
.property { display: grid; grid-template-columns: minmax(78px, 38%) minmax(0, 1fr); gap: 7px; align-items: start; min-height: 30px; padding: 3px 0; }
.property.modified { margin: 0 -4px; padding-right: 4px; padding-left: 5px; border-left: 2px solid var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder)); background: color-mix(in srgb, var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder)) 7%, transparent); }
.property:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.property-label { min-width: 0; padding-top: 4px; color: var(--vscode-foreground); line-height: 1.25; }
.property-value { min-width: 0; color: var(--vscode-descriptionForeground); text-align: right; overflow-wrap: anywhere; user-select: text; }
.property-input { width: 100%; padding: 2px 5px; }
.property-input.validation-error { border-color: var(--vscode-inputValidation-errorBorder); outline-color: var(--vscode-inputValidation-errorBorder); }
.property-validation { margin-top: 2px; color: var(--vscode-inputValidation-errorForeground); font-size: .85em; line-height: 1.2; text-align: left; }
.property-validation[hidden] { display: none; }
.property-components { display: grid; grid-template-columns: repeat(auto-fit, minmax(54px, 1fr)); gap: 4px; }
.property-component { min-width: 0; display: grid; grid-template-columns: 13px minmax(0, 1fr); align-items: center; }
.property-component-label { color: var(--vscode-descriptionForeground); font-size: .82em; text-align: left; }
.property-component-value { width: 100%; padding: 2px 4px; color: var(--vscode-input-foreground); text-align: right; }
.resource-control { display: flex; min-width: 0; }
.resource-field { min-width: 0; flex: 1; overflow: hidden; padding: 3px 6px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.resource-action { width: 24px; height: 24px; margin-left: 3px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
.badges { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.badge { padding: 1px 4px; border-radius: 2px; font-size: .8em; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
.badge.problem { color: var(--vscode-inputValidation-errorForeground); background: var(--vscode-inputValidation-errorBackground); }
.add-component { width: 100%; height: 28px; margin-top: 10px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
.add-component:disabled { color: var(--vscode-disabledForeground); }
@media (max-width: 300px) {
	.entity-primary { grid-template-columns: 24px auto minmax(48px, 1fr); }
	.entity-static { grid-column: 3; }
	.property { grid-template-columns: 1fr; gap: 2px; }
	.property-label { padding-top: 0; }
}
`;

const clientScript = `
const vscode = acquireVsCodeApi();
const app = document.getElementById('app');
if (bootstrap.status !== 'ready') {
	app.innerHTML = '<section class="message-shell"><div class="message-content"><div class="message-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 3 27 9.3v13.4L16 29 5 22.7V9.3L16 3Z M5.5 9.6 16 16l10.5-6.4M16 16v13"></path></svg></div><h2 class="message-title"></h2><p class="message-detail"></p></div></section>';
	const title = app.querySelector('.message-title');
	const detail = app.querySelector('.message-detail');
	if (bootstrap.status === 'empty') {
		title.textContent = bootstrap.strings.empty;
		detail.textContent = bootstrap.strings.emptyDetail;
	} else {
		title.textContent = bootstrap.status === 'loading' ? bootstrap.strings.loading : bootstrap.strings.rejected;
		detail.textContent = '';
	}
} else {
	const snapshot = bootstrap.snapshot;
	app.innerHTML = '<section class="inspector-shell"><header class="inspector-toolbar"><div class="inspector-title"></div><span class="inspector-readonly" hidden></span><button class="inspector-menu" type="button" disabled aria-label="">\u22ef</button></header><div class="inspector-scroll"><section class="entity-card"><div class="entity-primary"><span class="entity-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 2.5 8 4.6v9.8l-8 4.6-8-4.6V7.1l8-4.6Z M4.4 7.3 12 12l7.6-4.7M12 12v9.5"></path></svg></span><span class="entity-enabled"></span><input class="entity-name" type="text" readonly><label class="check-label entity-static deferred-control"><input class="deferred-checkbox" type="checkbox" disabled><span></span></label></div><div class="entity-metadata"><label class="metadata-label tag-label"></label><select class="deferred-select tag-select" disabled><option></option></select><label class="metadata-label layer-label"></label><select class="deferred-select layer-select" disabled><option></option></select></div></section><section class="component-stack"></section><button class="add-component" type="button" disabled></button></div></section>';
	const toolbarTitle = app.querySelector('.inspector-title');
	const readonlyStatus = app.querySelector('.inspector-readonly');
	const menu = app.querySelector('.inspector-menu');
	const enabledControl = app.querySelector('.entity-enabled');
	const nameInput = app.querySelector('.entity-name');
	const staticLabel = app.querySelector('.entity-static span');
	const tagLabel = app.querySelector('.tag-label');
	const tagOption = app.querySelector('.tag-select option');
	const layerLabel = app.querySelector('.layer-label');
	const layerOption = app.querySelector('.layer-select option');
	const componentStack = app.querySelector('.component-stack');
	const addComponent = app.querySelector('.add-component');
	toolbarTitle.textContent = bootstrap.strings.inspector;
	readonlyStatus.textContent = bootstrap.strings.readOnly;
	readonlyStatus.hidden = snapshot.editable;
	menu.setAttribute('aria-label', bootstrap.strings.componentActions);
	menu.setAttribute('title', bootstrap.strings.deferred);
	nameInput.value = snapshot.title;
	nameInput.setAttribute('aria-label', bootstrap.strings.entityName);
	nameInput.setAttribute('title', bootstrap.strings.deferred);
	staticLabel.textContent = bootstrap.strings.static;
	app.querySelector('.entity-static').setAttribute('title', bootstrap.strings.deferred);
	tagLabel.textContent = bootstrap.strings.tag;
	tagOption.textContent = bootstrap.strings.untagged;
	app.querySelector('.tag-select').setAttribute('title', bootstrap.strings.deferred);
	layerLabel.textContent = bootstrap.strings.layer;
	layerOption.textContent = bootstrap.strings.defaultLayer;
	app.querySelector('.layer-select').setAttribute('title', bootstrap.strings.deferred);
	addComponent.textContent = bootstrap.strings.addComponent;
	addComponent.setAttribute('title', bootstrap.strings.deferred);
	const savedState = vscode.getState();
	const collapsedGroups = new Set(Array.isArray(savedState?.collapsedGroups)
		? savedState.collapsedGroups.filter(value => typeof value === 'string') : []);
	let selectedGroupId = bootstrap.selectedGroupId;
	let validationSequence = 0;
	const numericEditors = new Set();
	const pendingNumericEditors = new Set();

	function savePresentationState() {
		vscode.setState({ collapsedGroups: Array.from(collapsedGroups) });
	}

	function collapseKey(groupId) {
		const occurrence = snapshot.target.occurrence;
		return JSON.stringify([
			snapshot.target.kind, snapshot.target.source, snapshot.target.identity,
			occurrence?.definitionAssetId ?? null, occurrence?.entityPath ?? null,
			groupId
		]);
	}

	function selectGroup(groupId, notify = true) {
		if (!snapshot.groups.some(group => group.identity === groupId)) { return; }
		selectedGroupId = groupId;
		if (notify) { vscode.postMessage({ type: 'selectGroup', groupId }); }
	}

	const entityGroup = snapshot.groups.find(group => group.kind === 'entity' || group.kind === 'placement');
	const enabledProperty = entityGroup?.properties.find(property => property.identity === 'enabled');
	if (entityGroup !== undefined && enabledProperty !== undefined && enabledProperty.propertyEditor.kind === 'boolean') {
		renderPropertyEditor(enabledControl, enabledProperty.propertyEditor, entityGroup.identity, enabledProperty.identity);
	} else {
		const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'property-checkbox'; checkbox.disabled = true;
		enabledControl.append(checkbox);
	}
	enabledControl.setAttribute('title', bootstrap.strings.enabled);

	for (const group of snapshot.groups.filter(candidate => candidate.kind === 'component')) {
		componentStack.append(renderComponent(group));
	}

	function renderComponent(group) {
		const card = document.createElement('details'); card.className = 'component-card'; card.dataset.groupId = group.identity;
		const key = collapseKey(group.identity); card.open = !collapsedGroups.has(key);
		const header = document.createElement('summary'); header.className = 'component-header';
		const disclosure = document.createElement('span'); disclosure.className = 'component-disclosure'; disclosure.setAttribute('aria-hidden', 'true'); disclosure.textContent = '▾';
		const icon = document.createElement('span'); icon.className = 'component-icon'; icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = componentIcon(group);
		const label = document.createElement('span'); label.className = 'component-name'; label.textContent = group.label;
		const actions = document.createElement('span'); actions.className = 'component-actions';
		for (const action of [[bootstrap.strings.componentHelp, '?'], [bootstrap.strings.componentSettings, '☷'], [bootstrap.strings.componentActions, '⋯']]) {
			const button = document.createElement('button'); button.type = 'button'; button.className = 'component-action'; button.disabled = true;
			button.setAttribute('aria-label', action[0]); button.setAttribute('title', bootstrap.strings.deferred); button.textContent = action[1]; actions.append(button);
		}
		header.append(disclosure, icon, label, actions); card.append(header);
		const body = document.createElement('div'); body.className = 'component-body';
		if (group.description) { const description = document.createElement('p'); description.className = 'component-description'; description.textContent = group.description; body.append(description); }
		if (group.metadataStatus === 'unavailable') { const warning = document.createElement('p'); warning.className = 'component-warning'; warning.textContent = bootstrap.strings.metadataUnavailable; body.append(warning); }
		for (const property of group.properties) { body.append(renderProperty(group.identity, property)); }
		card.append(body);
		header.addEventListener('click', event => {
			if (event.target.closest('button') !== null) { event.preventDefault(); return; }
			selectGroup(group.identity);
		});
		card.addEventListener('toggle', () => {
			if (card.open) { collapsedGroups.delete(key); } else { collapsedGroups.add(key); }
			savePresentationState();
		});
		return card;
	}

	function renderProperty(groupId, property) {
		const row = document.createElement('div'); row.className = 'property'; row.tabIndex = -1; row.dataset.propertyId = property.identity; row.dataset.editorKind = property.propertyEditor.kind;
		if (property.state.modified) { row.classList.add('modified'); row.title = bootstrap.strings.modified; }
		const label = document.createElement('div'); label.className = 'property-label'; label.textContent = property.label; if (property.description) { label.title = property.description; }
		const value = document.createElement('div'); value.className = 'property-value'; renderPropertyEditor(value, property.propertyEditor, groupId, property.identity);
		row.append(label, value);
		const badges = propertyBadges(property);
		if (badges.length) { const box = document.createElement('div'); box.className = 'badges'; for (const badge of badges) { const item = document.createElement('span'); item.className = 'badge' + (badge.problem ? ' problem' : ''); item.textContent = badge.text; box.append(item); } row.append(box); }
		return row;
	}

	function propertyBadges(property) {
		const badges = [];
		if (property.state.origin === 'unset') { badges.push({ text: property.required ? bootstrap.strings.required : bootstrap.strings.unset, problem: property.required }); }
		if (property.state.validity === 'broken-reference') { badges.push({ text: bootstrap.strings.broken, problem: true }); }
		if (property.state.validity === 'metadata-unavailable') { badges.push({ text: bootstrap.strings.metadataUnavailable }); }
		return badges;
	}

	function renderPropertyEditor(container, editor, groupId, propertyId) {
		switch (editor.kind) {
			case 'boolean': {
				const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'property-checkbox'; input.checked = editor.value === true; input.disabled = !editor.editable;
				if (editor.editable) { input.addEventListener('change', () => vscode.postMessage({ type: 'editProperty', groupId, propertyId, candidate: { kind: 'boolean', value: input.checked } })); }
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
			case 'reference': renderResource(container, semanticLabel(editor.label, editor.resolution)); return;
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

	function renderResource(container, label) {
		const control = document.createElement('div'); control.className = 'resource-control';
		const field = document.createElement('div'); field.className = 'resource-field'; field.textContent = label; field.title = label;
		const action = document.createElement('button'); action.type = 'button'; action.className = 'resource-action'; action.disabled = true; action.textContent = '◎';
		action.setAttribute('aria-label', bootstrap.strings.chooseResource); action.setAttribute('title', bootstrap.strings.deferred);
		control.append(field, action); container.append(control);
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

	function componentIcon(group) {
		const key = ((group.componentType?.id ?? '') + ' ' + group.label).toLocaleLowerCase();
		if (key.includes('transform')) { return '<svg viewBox="0 0 20 20"><path d="M10 2v16M2 10h16M10 2 8 4m2-2 2 2M18 10l-2-2m2 2-2 2"></path></svg>'; }
		if (key.includes('mesh') || key.includes('renderer')) { return '<svg viewBox="0 0 20 20"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Zm-7 4 7 4 7-4m-7 4v8"></path></svg>'; }
		if (key.includes('collider') || key.includes('collision')) { return '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"></rect><path d="M6 3v14M14 3v14M3 6h14M3 14h14"></path></svg>'; }
		if (key.includes('light')) { return '<svg viewBox="0 0 20 20"><circle cx="10" cy="8" r="4"></circle><path d="M8 13h4m-3 3h2M10 1v2M3.6 3.6 5 5m10-1.4L13.6 5M2 9h2m12 0h2"></path></svg>'; }
		if (key.includes('script')) { return '<svg viewBox="0 0 20 20"><path d="M6 2h6l4 4v12H6V2Zm6 0v4h4M9 10h4m-4 3h4"></path></svg>'; }
		return '<svg viewBox="0 0 20 20"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Zm-7 4 7 4 7-4m-7 4v8"></path></svg>';
	}

	window.addEventListener('message', event => {
		if (event.data?.type === 'focusGroup' && typeof event.data.groupId === 'string' && event.data.groupId !== selectedGroupId) {
			selectGroup(event.data.groupId, false);
			const card = Array.from(componentStack.querySelectorAll('.component-card')).find(candidate => candidate.dataset.groupId === event.data.groupId);
			if (card) { card.open = true; card.scrollIntoView({ block: 'nearest' }); }
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
	if (selectedGroupId !== entityGroup?.identity) {
		const selectedCard = Array.from(componentStack.querySelectorAll('.component-card')).find(candidate => candidate.dataset.groupId === selectedGroupId);
		if (selectedCard) { selectedCard.open = true; }
	}
}
`;
