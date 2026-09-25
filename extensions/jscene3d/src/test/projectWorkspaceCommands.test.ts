/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	closeCodeOssWorkspace,
	openCodeOssProjectWorkspace,
	ProjectWorkspaceCommandExecutor
} from '../project/projectWorkspaceCommands';

suite('JScene3D project workspace commands', () => {
	test('opens the canonical root through the workbench transition command', async () => {
		const executor = new TestCommandExecutor();
		const rootUri = 'file:///projects/sample';

		await openCodeOssProjectWorkspace(executor, rootUri);

		assert.deepStrictEqual(executor.commands, [{ command: 'jscene3d.workbench.openProjectWorkspace', args: [rootUri] }]);
	});

	test('uses the non-interactive workbench close transition command', async () => {
		const executor = new TestCommandExecutor();

		await closeCodeOssWorkspace(executor);

		assert.deepStrictEqual(executor.commands, [{ command: 'jscene3d.workbench.closeProjectWorkspace', args: [] }]);
	});

	test('propagates workbench transition command failure', async () => {
		const executor = new TestCommandExecutor();
		executor.error = new Error('host close failed');

		await assert.rejects(closeCodeOssWorkspace(executor), /host close failed/);
	});
});

class TestCommandExecutor implements ProjectWorkspaceCommandExecutor {
	readonly commands: Array<{ readonly command: string; readonly args: unknown[] }> = [];
	error: Error | undefined;

	executeCommand(command: string, ...args: unknown[]): PromiseLike<unknown> {
		this.commands.push({ command, args });
		return this.error === undefined ? Promise.resolve() : Promise.reject(this.error);
	}
}
