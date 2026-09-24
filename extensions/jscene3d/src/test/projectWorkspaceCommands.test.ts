/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	closeCodeOssWorkspace,
	ProjectWorkspaceCommandExecutor
} from '../project/projectWorkspaceCommands';

suite('JScene3D project workspace commands', () => {
	test('uses the non-interactive Code OSS Close Folder command', async () => {
		const executor = new TestCommandExecutor();

		await closeCodeOssWorkspace(executor);

		assert.deepStrictEqual(executor.commands, ['workbench.action.closeFolder']);
	});

	test('propagates Close Folder command failure', async () => {
		const executor = new TestCommandExecutor();
		executor.error = new Error('host close failed');

		await assert.rejects(closeCodeOssWorkspace(executor), /host close failed/);
	});
});

class TestCommandExecutor implements ProjectWorkspaceCommandExecutor {
	readonly commands: string[] = [];
	error: Error | undefined;

	executeCommand(command: string): PromiseLike<unknown> {
		this.commands.push(command);
		return this.error === undefined ? Promise.resolve() : Promise.reject(this.error);
	}
}
