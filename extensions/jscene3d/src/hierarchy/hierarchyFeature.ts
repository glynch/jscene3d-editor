/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { HierarchyViewProvider } from './hierarchyView';
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
	const provider = new HierarchyViewProvider(
		definitions,
		selected => {
			definitions.select(selected);
			void inspector.reveal();
		},
		() => definitions.clearSelection(),
		() => void vscode.window.showInformationMessage(vscode.l10n.t('Add Entity is not available yet.'))
	);
	const registration = vscode.window.registerWebviewViewProvider(hierarchyViewId, provider);
	logger.appendLine('JScene3D Hierarchy registered with Java-authoritative Scene snapshots.');
	return vscode.Disposable.from(registration, provider);
}
