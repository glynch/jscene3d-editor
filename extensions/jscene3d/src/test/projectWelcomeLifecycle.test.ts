/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import { ProjectSnapshot } from '../project/projectState';
import { ProjectWelcomeHost, ProjectWelcomeLifecycle } from '../project/projectWelcomeLifecycle';

suite('JScene3D Project Welcome lifecycle', () => {
	test('closes Welcome once after each successfully opened Project generation', async () => {
		const host = new TestWelcomeHost();
		const lifecycle = new ProjectWelcomeLifecycle(host, new TestLogger());

		await lifecycle.synchronize(emptySnapshot('opening'));
		await lifecycle.synchronize(openSnapshot(7));
		await lifecycle.synchronize(openSnapshot(7));
		await lifecycle.synchronize({ ...openSnapshot(7), status: 'replacing' });
		await lifecycle.synchronize(openSnapshot(8));

		assert.strictEqual(host.closeCalls, 2);
	});

	test('does not close Welcome for failed or cancelled Project opening', async () => {
		const host = new TestWelcomeHost();
		const lifecycle = new ProjectWelcomeLifecycle(host, new TestLogger());

		await lifecycle.synchronize(emptySnapshot('opening'));
		await lifecycle.synchronize(emptySnapshot('cancellingOpen'));
		await lifecycle.synchronize(emptySnapshot('closed'));
		await lifecycle.synchronize({
			status: 'openFailed',
			failure: 'invalid',
			activeDiagnostics: [],
			attemptDiagnostics: []
		});

		assert.strictEqual(host.closeCalls, 0);
	});

	test('logs a Welcome close failure without changing Project state', async () => {
		const host = new TestWelcomeHost();
		host.failure = new Error('close failed');
		const logger = new TestLogger();
		const lifecycle = new ProjectWelcomeLifecycle(host, logger);

		await lifecycle.synchronize(openSnapshot(7));

		assert.deepStrictEqual(logger.lines, ['Failed to close JScene3D Welcome: close failed']);
	});
});

class TestWelcomeHost implements ProjectWelcomeHost {
	closeCalls = 0;
	failure: Error | undefined;

	async closeWelcome(): Promise<void> {
		this.closeCalls++;
		if (this.failure !== undefined) {
			throw this.failure;
		}
	}
}

class TestLogger {
	readonly lines: string[] = [];
	appendLine(message: string): void { this.lines.push(message); }
}

function emptySnapshot(status: 'closed' | 'opening' | 'cancellingOpen'): ProjectSnapshot {
	return { status, activeDiagnostics: [], attemptDiagnostics: [] };
}

function openSnapshot(generation: number): ProjectSnapshot & { readonly status: 'open'; readonly generation: number } {
	return {
		status: 'open',
		generation,
		project,
		activeDiagnostics: [],
		attemptDiagnostics: []
	};
}

const project: ProjectSummaryDto = {
	id: 'sandbox',
	name: 'JScene3D Editor Sandbox',
	version: '0.1.0-SNAPSHOT',
	root: '/projects/sandbox',
	descriptor: '/projects/sandbox/sandbox.j3d',
	mainScene: null,
	assetCounts: { authored: 0, projected: 0 },
	catalog: { scenes: [], entityDefinitions: [] }
};
