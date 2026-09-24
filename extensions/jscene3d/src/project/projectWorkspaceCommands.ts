/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Minimal command boundary used to invoke Code OSS's non-interactive Close Folder action. */
export interface ProjectWorkspaceCommandExecutor {
	executeCommand(command: string): PromiseLike<unknown>;
}

/** Closes the current folder/workspace without invoking an open-folder picker. */
export async function closeCodeOssWorkspace(executor: ProjectWorkspaceCommandExecutor): Promise<void> {
	await executor.executeCommand('workbench.action.closeFolder');
}
