/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState, AuthoredDefinitionStateChange } from '../definition/authoredDefinitionState';
import { HierarchyNodeDto } from '../protocol/authoringProtocol';
import { hierarchyTreeItem } from './hierarchyViewModel';

/** Presents the active authored definition's immutable Java hierarchy snapshot as a native TreeView. */
export class HierarchyTreeDataProvider implements vscode.TreeDataProvider<HierarchyNodeDto>, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<HierarchyNodeDto | undefined>();
	private readonly subscription: { dispose(): void };
	private tree: vscode.TreeView<HierarchyNodeDto> | undefined;
	private reportRestoreFailure: ((error: unknown) => void) | undefined;
	private restoreToken = 0;
	private restoringSelection = false;
	readonly onDidChangeTreeData = this.changed.event;

	constructor(private readonly state: AuthoredDefinitionState) {
		this.subscription = state.onDidChange(change => this.definitionChanged(change));
	}

	/** Connects the created native TreeView so retained semantic selection can be visibly restored. */
	attach(
		tree: vscode.TreeView<HierarchyNodeDto>,
		reportRestoreFailure: (error: unknown) => void
	): void {
		this.tree = tree;
		this.reportRestoreFailure = reportRestoreFailure;
	}

	/** Reports whether an empty native selection event is part of a definition-context transition. */
	get isRestoringSelection(): boolean {
		return this.restoringSelection;
	}

	getTreeItem(element: HierarchyNodeDto): vscode.TreeItem {
		const model = hierarchyTreeItem(element);
		const item = new vscode.TreeItem(
			model.label,
			model.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
		);
		item.id = model.id;
		item.contextValue = `jscene3d.hierarchy.${model.kind}`;
		item.iconPath = new vscode.ThemeIcon(model.kind === 'placement' ? 'references' : 'symbol-structure');
		if (!model.enabled) {
			item.description = vscode.l10n.t('disabled');
		} else if (!model.editable) {
			item.description = vscode.l10n.t('read-only');
		}
		return item;
	}

	getChildren(element?: HierarchyNodeDto): HierarchyNodeDto[] {
		return Array.from(element?.children ?? this.state.active?.snapshot.roots ?? []);
	}

	/** Resolves an authoritative snapshot node's parent so native reveal can restore nested selection. */
	getParent(element: HierarchyNodeDto): HierarchyNodeDto | undefined {
		return findParent(this.state.active?.snapshot.roots ?? [], element);
	}

	dispose(): void {
		this.restoreToken++;
		this.restoringSelection = false;
		this.tree = undefined;
		this.reportRestoreFailure = undefined;
		this.subscription.dispose();
		this.changed.dispose();
	}

	private definitionChanged(change: AuthoredDefinitionStateChange): void {
		if (change === 'selection') {
			return;
		}
		const token = ++this.restoreToken;
		this.restoringSelection = true;
		this.changed.fire(undefined);
		const selectedNode = this.state.selectedNode;
		void Promise.resolve().then(async () => {
			try {
				if (selectedNode !== undefined && this.tree !== undefined) {
					await this.tree.reveal(selectedNode, { select: true, focus: false });
				}
			} catch (error) {
				this.reportRestoreFailure?.(error);
			} finally {
				if (token === this.restoreToken) {
					this.restoringSelection = false;
				}
			}
		});
	}
}

function findParent(
	roots: readonly HierarchyNodeDto[],
	target: HierarchyNodeDto
): HierarchyNodeDto | undefined {
	for (const node of roots) {
		if (node.children.includes(target)) {
			return node;
		}
		const parent = findParent(node.children, target);
		if (parent !== undefined) {
			return parent;
		}
	}
	return undefined;
}
