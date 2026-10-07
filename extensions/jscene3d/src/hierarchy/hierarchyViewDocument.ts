/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Content projected into the persistent Hierarchy webview document. */
export interface HierarchyViewUpdate {
	readonly type: 'jscene3d.hierarchy.update';
	readonly revision: number;
	readonly content: string;
	readonly selected?: string;
	readonly filtering: boolean;
}

/** Webview operations needed by the persistent Hierarchy document. */
export interface HierarchyViewDocumentSurface {
	initializeDocument(html: string): void;
	postMessage(message: HierarchyViewUpdate): PromiseLike<boolean>;
}

/** Keeps the search control alive while replacing only the filtered hierarchy content. */
export class HierarchyViewDocument {
	private revision = 0;
	private ready = false;
	private disposed = false;
	private latestUpdate: HierarchyViewUpdate;

	constructor(
		private readonly surface: HierarchyViewDocumentSurface,
		initialContent: string,
		selected: string | undefined,
		filtering: boolean,
		query: string,
		searchPlaceholder: string,
		addLabel: string,
		nonce: string
	) {
		this.latestUpdate = this.createUpdate(initialContent, selected, filtering);
		this.surface.initializeDocument(hierarchyViewDocumentHtml(
			this.latestUpdate, query, searchPlaceholder, addLabel, nonce));
	}

	update(content: string, selected: string | undefined, filtering: boolean): void {
		if (this.disposed) {
			return;
		}
		this.latestUpdate = this.createUpdate(content, selected, filtering);
		this.deliverLatestUpdate();
	}

	acceptReady(): void {
		if (this.disposed) {
			return;
		}
		this.ready = true;
		this.deliverLatestUpdate();
	}

	dispose(): void {
		this.disposed = true;
	}

	private createUpdate(content: string, selected: string | undefined, filtering: boolean): HierarchyViewUpdate {
		return {
			type: 'jscene3d.hierarchy.update',
			revision: ++this.revision,
			content,
			selected,
			filtering
		};
	}

	private deliverLatestUpdate(): void {
		if (this.ready && !this.disposed) {
			void this.surface.postMessage(this.latestUpdate);
		}
	}
}

/** Creates one static Hierarchy shell whose search control survives model updates. */
export function hierarchyViewDocumentHtml(
	initialUpdate: HierarchyViewUpdate,
	query: string,
	searchPlaceholder: string,
	addLabel: string,
	nonce: string
): string {
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${escapeHtml(nonce)}'; script-src 'nonce-${escapeHtml(nonce)}';">
		<style nonce="${escapeHtml(nonce)}">${styles}</style></head><body>
		<div class="toolbar"><input id="search" type="search" value="${escapeHtml(query)}" placeholder="${escapeHtml(searchPlaceholder)}" aria-label="${escapeHtml(searchPlaceholder)}"><button id="add" title="${escapeHtml(addLabel)}" aria-label="${escapeHtml(addLabel)}">+</button></div>
		<div id="content"></div><script nonce="${escapeHtml(nonce)}">${script(initialUpdate)}</script></body></html>`;
}

function script(initialUpdate: HierarchyViewUpdate): string {
	return `const vscode = acquireVsCodeApi();
		let retained = vscode.getState() ?? { collapsed: [] };
		const content = document.getElementById('content');
		const search = document.getElementById('search');
		let revision = 0;
		let timer;
		const rememberCollapsed = () => { const collapsed = Array.from(document.querySelectorAll('details[data-branch]:not([open])'), item => item.dataset.branch); retained = { collapsed }; vscode.setState(retained); };
		const render = message => {
			if (message.type !== 'jscene3d.hierarchy.update' || message.revision <= revision) { return; }
			content.innerHTML = message.content;
			revision = message.revision;
			if (!message.filtering) { document.querySelectorAll('details[data-branch]').forEach(branch => { branch.open = !retained.collapsed.includes(branch.dataset.branch); }); }
			document.querySelectorAll('details[data-branch]').forEach(branch => branch.addEventListener('toggle', rememberCollapsed));
			document.querySelectorAll('.entity').forEach(row => row.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); vscode.postMessage({ type: 'select', occurrence: row.dataset.occurrence }); }));
			if (message.selected) { const row = document.querySelector('[data-occurrence="' + CSS.escape(message.selected) + '"]'); let parent = row?.parentElement; while (parent) { if (parent.tagName === 'DETAILS') { parent.open = true; } parent = parent.parentElement; } row?.scrollIntoView({ block: 'nearest' }); }
		};
		document.getElementById('add').addEventListener('click', () => vscode.postMessage({ type: 'add' }));
		search.addEventListener('input', event => { clearTimeout(timer); timer = setTimeout(() => vscode.postMessage({ type: 'filter', query: event.target.value }), 120); });
		content.addEventListener('click', event => { if (event.target === content) { vscode.postMessage({ type: 'clear' }); } });
		window.addEventListener('message', event => render(event.data));
		render(${JSON.stringify(initialUpdate)});
		vscode.postMessage({ type: 'ready' });`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\u0027': '&#39;' })[character]!);
}

const styles = `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);font:var(--vscode-font-size)/1.4 var(--vscode-font-family);background:var(--vscode-sideBar-background)}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) 28px;gap:6px;padding:6px 8px;border-bottom:1px solid var(--vscode-sideBarSectionHeader-border)}input{width:100%;height:26px;border:1px solid var(--vscode-input-border,transparent);padding:3px 7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);outline:none}input:focus{border-color:var(--vscode-focusBorder)}#add{border:0;border-radius:2px;color:var(--vscode-icon-foreground);background:transparent;font-size:20px;line-height:24px;cursor:pointer}#add:hover{background:var(--vscode-toolbar-hoverBackground)}#content{min-height:calc(100vh - 39px);padding:6px 0}.scene-root{display:flex;gap:7px;align-items:center;padding:6px 10px;font-weight:600;border-bottom:1px solid var(--vscode-sideBarSectionHeader-border)}.scene-icon,.entity-icon{width:16px;text-align:center;color:var(--vscode-symbolIcon-classForeground)}ul{list-style:none;margin:0;padding-left:14px}.tree{padding-left:4px}li{margin:0}details>summary{display:flex;align-items:center;list-style:none}details>summary::-webkit-details-marker{display:none}details>summary:before{content:'›';width:12px;transform:rotate(90deg);color:var(--vscode-icon-foreground)}details:not([open])>summary:before{transform:none}.entity{display:flex;min-width:0;flex:1;gap:6px;align-items:center;height:24px;border:0;padding:0 6px;color:var(--vscode-foreground);background:transparent;text-align:left;cursor:pointer}.entity:hover{background:var(--vscode-list-hoverBackground)}.entity.selected{color:var(--vscode-list-activeSelectionForeground);background:var(--vscode-list-activeSelectionBackground)}.entity.disabled{opacity:.55}.label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.readonly{margin-left:auto;color:var(--vscode-descriptionForeground);font-size:11px}.empty{padding:8px 12px;color:var(--vscode-descriptionForeground)}`;
