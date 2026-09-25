/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { HierarchyNodeDto } from '../protocol/authoringProtocol';
import { hierarchyTreeItem } from './hierarchyViewModel';

/** Presents the active authored definition's immutable Java hierarchy snapshot as a native TreeView. */
export class HierarchyTreeDataProvider implements vscode.TreeDataProvider<HierarchyNodeDto>, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<HierarchyNodeDto | undefined>();
	private readonly subscription: { dispose(): void };
	readonly onDidChangeTreeData = this.changed.event;

	constructor(private readonly state: AuthoredDefinitionState) {
		this.subscription = state.onDidChange(() => this.changed.fire(undefined));
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

	dispose(): void {
		this.subscription.dispose();
		this.changed.dispose();
	}
}
