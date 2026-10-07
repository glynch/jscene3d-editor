/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { HierarchyNodeDto } from '../protocol/authoringProtocol';
import { HierarchyViewDocument } from './hierarchyViewDocument';
import { filterHierarchyNodes, occurrenceKey } from './hierarchyViewModel';

interface HierarchyMessage {
	readonly type: 'select' | 'clear' | 'filter' | 'add' | 'ready';
	readonly occurrence?: string;
	readonly query?: string;
}

/** Presents the Java-authoritative Scene hierarchy with search and shared semantic selection. */
export class HierarchyViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private readonly subscription: { dispose(): void };
	private document: HierarchyViewDocument | undefined;
	private messageSubscription: vscode.Disposable | undefined;
	private query = '';

	constructor(
		private readonly state: AuthoredDefinitionState,
		private readonly selectNode: (node: HierarchyNodeDto) => void,
		private readonly clearSelection: () => void,
		private readonly addEntity: () => void
	) {
		this.subscription = state.onDidChange(() => this.publish());
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = { enableScripts: true };
		this.messageSubscription?.dispose();
		this.messageSubscription = view.webview.onDidReceiveMessage(message => this.acceptMessage(message));
		this.document?.dispose();
		const projection = this.projection();
		this.document = new HierarchyViewDocument(
			{
				initializeDocument: html => view.webview.html = html,
				postMessage: message => view.webview.postMessage(message)
			},
			projection.content,
			projection.selected,
			projection.filtering,
			this.query,
			vscode.l10n.t('Search Entities...'),
			vscode.l10n.t('Add Entity'),
			nonceValue()
		);
	}

	dispose(): void {
		this.subscription.dispose();
		this.messageSubscription?.dispose();
		this.messageSubscription = undefined;
		this.document?.dispose();
		this.document = undefined;
	}

	private acceptMessage(value: unknown): void {
		if (value === null || typeof value !== 'object') {
			return;
		}
		const message = value as Partial<HierarchyMessage>;
		switch (message.type) {
			case 'ready':
				this.document?.acceptReady();
				break;
			case 'filter':
				this.query = typeof message.query === 'string' ? message.query : '';
				this.publish();
				break;
			case 'select': {
				const node = typeof message.occurrence === 'string'
					? findByKey(this.state.active?.snapshot.roots ?? [], message.occurrence)
					: undefined;
				if (node !== undefined) {
					this.selectNode(node);
				}
				break;
			}
			case 'clear':
				this.clearSelection();
				break;
			case 'add':
				this.addEntity();
				break;
		}
	}

	private publish(): void {
		if (this.document === undefined) {
			return;
		}
		const projection = this.projection();
		this.document.update(projection.content, projection.selected, projection.filtering);
	}

	private projection(): { readonly content: string; readonly selected?: string; readonly filtering: boolean } {
		const active = this.state.active;
		const selected = this.state.selectedNode === undefined
			? undefined
			: occurrenceKey(this.state.selectedNode.occurrence);
		const roots = filterHierarchyNodes(active?.snapshot.roots ?? [], this.query);
		const scene = active?.snapshot.context.kind === 'scene-definition';
		const rootLabel = active?.snapshot.context.label.text ?? '';
		const content = active === undefined
			? `<p class="empty">${escapeHtml(vscode.l10n.t('Open a JScene3D authored definition to show its hierarchy.'))}</p>`
			: `${scene ? `<div class="scene-root"><span class="scene-icon">◇</span><span>${escapeHtml(rootLabel)}</span></div>` : ''}
				${roots.length === 0 ? emptyMessage(this.query) : `<ul class="tree">${roots.map(node => renderNode(node, selected)).join('')}</ul>`}`;
		return { content, selected, filtering: this.query.length > 0 };
	}
}

function emptyMessage(query: string): string {
	const message = query.length > 0 ? vscode.l10n.t('No matching entities.') : vscode.l10n.t('This definition contains no entities.');
	return `<p class="empty">${escapeHtml(message)}</p>`;
}

function renderNode(node: HierarchyNodeDto, selected: string | undefined): string {
	const key = occurrenceKey(node.occurrence);
	const row = `<button class="entity${selected === key ? ' selected' : ''}${node.enabled ? '' : ' disabled'}" data-occurrence="${escapeAttribute(key)}"><span class="entity-icon">◇</span><span class="label">${escapeHtml(node.label.text)}</span>${node.editable ? '' : `<span class="readonly">${escapeHtml(vscode.l10n.t('read-only'))}</span>`}</button>`;
	return node.children.length === 0
		? `<li>${row}</li>`
		: `<li><details open data-branch="${escapeAttribute(key)}"><summary>${row}</summary><ul>${node.children.map(child => renderNode(child, selected)).join('')}</ul></details></li>`;
}

function findByKey(nodes: readonly HierarchyNodeDto[], key: string): HierarchyNodeDto | undefined {
	for (const node of nodes) {
		if (occurrenceKey(node.occurrence) === key) {
			return node;
		}
		const child = findByKey(node.children, key);
		if (child !== undefined) {
			return child;
		}
	}
	return undefined;
}

function nonceValue(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\u0027': '&#39;' })[character]!);
}

function escapeAttribute(value: string): string {
	return escapeHtml(value);
}
