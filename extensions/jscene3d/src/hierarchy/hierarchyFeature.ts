/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { HierarchyTreeDataProvider } from './hierarchyView';
import { hierarchyViewId } from './hierarchyViewModel';

/** Inspector reveal operation triggered by a semantic Hierarchy selection. */
export interface HierarchyInspector {
	reveal(): Promise<void>;
}

/** Registers the native Hierarchy tree, restoration, and semantic selection behavior. */
export function registerHierarchyFeature(
	definitions: AuthoredDefinitionState,
	inspector: HierarchyInspector,
	logger: { appendLine(message: string): void }
): vscode.Disposable {
	const provider = new HierarchyTreeDataProvider(definitions);
	const tree = vscode.window.createTreeView(hierarchyViewId, { treeDataProvider: provider });
	provider.attach(tree, error => logger.appendLine(
		`Failed to restore JScene3D Hierarchy selection: ${errorMessage(error)}`));
	const selection = tree.onDidChangeSelection(event => {
		const selected = event.selection[0];
		if (selected !== undefined) {
			definitions.select(selected);
			void inspector.reveal();
		} else if (!provider.isRestoringSelection) {
			definitions.clearSelection();
		}
	});
	return vscode.Disposable.from(selection, tree, provider);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
