/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const viewId = 'jscene3d.project';
const placeholderSetting = 'jscene3d.project.placeholderLabel';
const initialLayoutKey = 'initialLayoutApplied';

function placeholderLabel(): string {
	return vscode.workspace.getConfiguration().get<string>(placeholderSetting, vscode.l10n.t('Project integration is a Stage 3 placeholder'));
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const changed = new vscode.EventEmitter<void>();
	const tree = vscode.window.createTreeView(viewId, {
		treeDataProvider: {
			onDidChangeTreeData: changed.event,
			getTreeItem: (item: vscode.TreeItem) => item,
			getChildren: () => [new vscode.TreeItem(placeholderLabel())]
		}
	});

	context.subscriptions.push(
		changed,
		tree,
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(placeholderSetting)) {
				changed.fire();
			}
		}),
		vscode.commands.registerCommand('jscene3d.showProjectPlaceholder', () => {
			vscode.window.showInformationMessage(placeholderLabel());
		})
	);

	if (!context.globalState.get(initialLayoutKey, false)) {
		await vscode.commands.executeCommand(`${viewId}.focus`);
		const secondarySideBar = vscode.workspace.getConfiguration('workbench.secondarySideBar');
		const visibility = secondarySideBar.inspect<string>('defaultVisibility');
		if (visibility?.globalValue === undefined && visibility?.workspaceValue === undefined && secondarySideBar.get('defaultVisibility') === 'hidden') {
			await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
		}
		await context.globalState.update(initialLayoutKey, true);
	}
}
