/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import type * as vscode from 'vscode';
import { InspectorState, InspectorStateSnapshot } from './inspectorState';
import { inspectorSearchIndex } from './inspectorViewModel';

export const inspectorViewId = 'jscene3d.inspector';
export const inspectorFocusCommandId = `${inspectorViewId}.focus`;

export type InspectorInboundMessage = { readonly type: 'selectGroup'; readonly groupId: string };
export type InspectorTranslate = (message: string, ...args: string[]) => string;
export type InspectorCommandExecutor = (command: string) => PromiseLike<unknown> | unknown;

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

	constructor(
		private readonly state: InspectorState,
		private readonly language: string,
		private readonly translate: InspectorTranslate
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
			}
		});
		this.render(true);
	}

	dispose(): void {
		this.stateSubscription.dispose();
		this.messageSubscription?.dispose();
		this.view = undefined;
		this.lastInspector = undefined;
	}

	private acceptMessage(value: unknown): void {
		if (!isInspectorMessage(value)) {
			return;
		}
		try {
			this.state.selectGroup(value.groupId);
		} catch {
			// A stale webview message is ignored; the next state render is authoritative.
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
}

export function isInspectorMessage(value: unknown): value is InspectorInboundMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const message = value as Record<string, unknown>;
	return message.type === 'selectGroup'
		&& typeof message.groupId === 'string'
		&& message.groupId.length > 0
		&& Object.keys(message).every(key => key === 'type' || key === 'groupId');
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
		defaultValue: translate('Default'),
		unset: translate('Unset'),
		required: translate('Required'),
		broken: translate('Broken reference'),
		metadataUnavailable: translate('Descriptor metadata unavailable'),
		resolved: translate('Resolved'),
		trueValue: translate('True'),
		falseValue: translate('False'),
		items: translate('{0} items', '{count}'),
		fields: translate('{0} fields', '{count}')
	};
	return state.status === 'ready'
		? {
			status: state.status,
			snapshot: state.inspector,
			selectedGroupId: state.selectedGroupId,
			searchIndex: inspectorSearchIndex(state.inspector),
			strings
		}
		: state.status === 'rejected'
			? { status: state.status, failureCode: state.failureCode, strings }
			: { status: state.status, strings };
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
.property:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.property-label { min-width: 0; color: var(--vscode-foreground); }
.property-value { min-width: 0; text-align: right; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); user-select: text; }
.property.block { display: block; }
.property.block .property-value { margin-top: 4px; text-align: left; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
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
	subtitle.textContent = snapshot.target.kind.replaceAll('-', ' ') + ' · ' + bootstrap.strings.readOnly;
	searchInput.setAttribute('placeholder', bootstrap.strings.filterPlaceholder);
	searchInput.setAttribute('aria-label', bootstrap.strings.filterPlaceholder);
	filterButton.setAttribute('aria-label', bootstrap.strings.filterOptions);
	filterButton.setAttribute('title', bootstrap.strings.filterOptions);
	filterMenuEmpty.textContent = bootstrap.strings.noFilterOptions;
	const savedState = vscode.getState();
	searchInput.value = typeof savedState?.query === 'string' ? savedState.query : '';
	let selectedGroupId = bootstrap.selectedGroupId;

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
		properties.replaceChildren();
		const group = snapshot.groups.find(candidate => candidate.identity === selectedGroupId);
		if (!group) { return; }
		const heading = document.createElement('h2'); heading.className = 'property-heading'; heading.textContent = group.label;
		properties.append(heading);
		if (group.description) { const description = document.createElement('p'); description.className = 'group-description'; description.textContent = group.description; properties.append(description); }
		for (const property of group.properties) {
			const row = document.createElement('div'); row.className = 'property'; row.tabIndex = -1; row.dataset.propertyId = property.identity;
			if (property.valueKind === 'array' && property.constraints.editor.semantic === 'default' || property.valueKind === 'object') { row.classList.add('block'); }
			const label = document.createElement('div'); label.className = 'property-label'; label.textContent = property.label; if (property.description) { label.title = property.description; }
			const value = document.createElement('div'); value.className = 'property-value'; value.textContent = displayValue(property.state.effectiveValue, property);
			row.append(label, value);
			const badges = propertyBadges(property);
			if (badges.length) { const box = document.createElement('div'); box.className = 'badges'; for (const badge of badges) { const item = document.createElement('span'); item.className = 'badge' + (badge.problem ? ' problem' : ''); item.textContent = badge.text; box.append(item); } row.append(box); }
			properties.append(row);
		}
		if (propertyId) { const row = Array.from(properties.querySelectorAll('.property')).find(candidate => candidate.dataset.propertyId === propertyId); if (row) { row.scrollIntoView({ block: 'center' }); row.focus(); } }
	}

	function propertyBadges(property) {
		const badges = [];
		if (property.state.origin === 'default') { badges.push({ text: bootstrap.strings.defaultValue }); }
		if (property.state.origin === 'unset') { badges.push({ text: property.required ? bootstrap.strings.required : bootstrap.strings.unset, problem: property.required }); }
		if (property.state.validity === 'broken-reference') { badges.push({ text: bootstrap.strings.broken, problem: true }); }
		if (property.state.validity === 'metadata-unavailable') { badges.push({ text: bootstrap.strings.metadataUnavailable }); }
		return badges;
	}

	function displayValue(value, property) {
		if (value === null) { return property.state.origin === 'unset' ? '—' : 'null'; }
		switch (value.kind) {
			case 'null': return 'null';
			case 'boolean': return value.value ? bootstrap.strings.trueValue : bootstrap.strings.falseValue;
			case 'number': return value.decimal;
			case 'text': return value.value;
			case 'array':
				return property.constraints.editor.semantic === 'default'
					? bootstrap.strings.items.replace('{count}', String(value.values.length))
					: value.values.map(entry => entry.kind === 'number' ? entry.decimal : displayValue(entry, property)).join('  ·  ');
			case 'object': return bootstrap.strings.fields.replace('{count}', String(Object.keys(value.values).length));
			case 'reference': return value.label + (value.resolution === 'broken' ? ' · ' + bootstrap.strings.broken : '');
			case 'entity-target': return value.label + (value.resolution === 'broken' ? ' · ' + bootstrap.strings.broken : '');
			case 'component-target': return value.entityLabel + ' · ' + value.componentLabel + (value.resolution === 'broken' ? ' · ' + bootstrap.strings.broken : '');
		}
	}

	function updateSearch() {
		searchResults.replaceChildren();
		const query = searchInput.value.trim().toLocaleLowerCase();
		vscode.setState({ query: searchInput.value });
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
	window.addEventListener('message', event => { if (event.data?.type === 'focusGroup' && typeof event.data.groupId === 'string' && event.data.groupId !== selectedGroupId) { selectGroup(event.data.groupId, undefined, false); } });
	selectGroup(selectedGroupId, undefined, false);
	updateSearch();
}
`;
