/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const openProjectWorkspaceCommand = 'jscene3d.workbench.openProjectWorkspace';
const closeProjectWorkspaceCommand = 'jscene3d.workbench.closeProjectWorkspace';

/** Minimal command boundary used to invoke Code OSS project-workspace transitions. */
export interface ProjectWorkspaceCommandExecutor {
	executeCommand(command: string, ...args: unknown[]): PromiseLike<unknown>;
}

/** Opens the canonical project root through the JScene3D workbench transition boundary. */
export async function openCodeOssProjectWorkspace(executor: ProjectWorkspaceCommandExecutor, rootUri: string): Promise<void> {
	await executor.executeCommand(openProjectWorkspaceCommand, rootUri);
}

/** Closes the current project workspace through the JScene3D workbench transition boundary. */
export async function closeCodeOssWorkspace(executor: ProjectWorkspaceCommandExecutor): Promise<void> {
	await executor.executeCommand(closeProjectWorkspaceCommand);
}
