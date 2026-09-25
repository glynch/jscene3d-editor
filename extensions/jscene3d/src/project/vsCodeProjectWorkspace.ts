/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	isExactProjectWorkspace,
	ProjectReopenIntent,
	ProjectReopenIntentStore,
	ProjectWorkspaceHost,
	ProjectWorkspaceResource
} from './projectWorkspaceLifecycle';
import { closeCodeOssWorkspace, openCodeOssProjectWorkspace } from './projectWorkspaceCommands';

const reopenIntentKey = 'pendingProjectReopen';

/** Adapts the public VS Code workspace API to the JScene3D project lifecycle. */
export class VsCodeProjectWorkspace implements ProjectWorkspaceHost {
	resourceForLocalPath(path: string): ProjectWorkspaceResource {
		return resource(vscode.Uri.file(path));
	}

	parseLocalResource(value: string): ProjectWorkspaceResource | undefined {
		let uri: vscode.Uri;
		try {
			uri = vscode.Uri.parse(value, true);
		} catch {
			return undefined;
		}
		return uri.scheme === 'file' && uri.fsPath.length > 0 ? resource(uri) : undefined;
	}

	matchesProjectRoot(root: ProjectWorkspaceResource): boolean {
		return isExactProjectWorkspace(
			root.uri,
			vscode.workspace.workspaceFile?.toString(),
			vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString())
		);
	}

	async openProjectRoot(root: ProjectWorkspaceResource): Promise<void> {
		await openCodeOssProjectWorkspace(vscode.commands, root.uri);
	}

	async closeProjectWorkspace(): Promise<void> {
		await closeCodeOssWorkspace(vscode.commands);
	}

	onDidChangeWorkspace(listener: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeWorkspaceFolders(listener);
	}
}

/** Stores one versioned reopen intent across the expected workspace restart. */
export class ExtensionProjectReopenIntentStore implements ProjectReopenIntentStore {
	constructor(private readonly state: vscode.Memento) { }

	read(): unknown {
		return this.state.get<unknown>(reopenIntentKey);
	}

	async write(value: ProjectReopenIntent | undefined): Promise<void> {
		await this.state.update(reopenIntentKey, value);
	}
}

function resource(uri: vscode.Uri): ProjectWorkspaceResource {
	return { uri: uri.toString(), fsPath: uri.fsPath };
}
