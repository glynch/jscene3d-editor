/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectState } from './projectState';
import { projectTree, ProjectTreeNode, ProjectViewLabels } from './projectViewModel';

/** Presents the shared project cache in the existing JScene3D Project view. */
export class ProjectTreeDataProvider implements vscode.TreeDataProvider<ProjectTreeNode>, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<ProjectTreeNode | undefined>();
	private readonly subscription: vscode.Disposable;
	readonly onDidChangeTreeData = this.changed.event;

	constructor(private readonly state: ProjectState) {
		this.subscription = state.onDidChange(() => this.changed.fire(undefined));
	}

	getTreeItem(element: ProjectTreeNode): vscode.TreeItem {
		const item = new vscode.TreeItem(
			element.label,
			element.children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded
		);
		item.description = element.description;
		item.tooltip = element.tooltip;
		item.command = element.command;
		return item;
	}

	getChildren(element?: ProjectTreeNode): ProjectTreeNode[] {
		return Array.from(element?.children ?? projectTree(this.state.snapshot, labels()));
	}

	dispose(): void {
		this.subscription.dispose();
		this.changed.dispose();
	}
}

/** Builds the localized labels used by the Project view model. */
function labels(): ProjectViewLabels {
	return {
		opening: vscode.l10n.t('Opening JScene3D project...'),
		closing: vscode.l10n.t('Closing JScene3D project...'),
		unavailable: vscode.l10n.t('Project unavailable'),
		openFailed: vscode.l10n.t('See Problems and JScene3D Output for details'),
		noProject: vscode.l10n.t('No JScene3D project is open'),
		name: vscode.l10n.t('Name'),
		id: vscode.l10n.t('ID'),
		version: vscode.l10n.t('Version'),
		descriptor: vscode.l10n.t('Descriptor'),
		projectRoot: vscode.l10n.t('Project Root'),
		mainScene: vscode.l10n.t('Main Scene'),
		notConfigured: vscode.l10n.t('Not configured'),
		authoredAssets: vscode.l10n.t('Authored Assets'),
		projectedAssets: vscode.l10n.t('Projected Assets')
	};
}
