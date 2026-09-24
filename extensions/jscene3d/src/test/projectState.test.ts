/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectDiagnosticDto, ProjectOpenResultDto, ProjectSummaryDto } from '../protocol/authoringProtocol';
import { projectDiagnosticPresentations } from '../project/projectDiagnosticModel';
import { ProjectAuthoringClient, ProjectState } from '../project/projectState';
import { projectTree, ProjectViewLabels } from '../project/projectViewModel';

suite('JScene3D project state', () => {
	test('retains a successful summary and diagnostics', async () => {
		const client = new TestProjectClient();
		const logger = new TestLogger();
		const state = new ProjectState(client, logger);
		client.nextOpen = Promise.resolve(openResult());
		await state.open('/projects/small/small.j3d');
		assert.deepStrictEqual(state.snapshot, {
			status: 'open',
			generation: 7,
			project: summary,
			diagnostics: [diagnostic]
		});
		assert.deepStrictEqual(logger.lines, [
			'Opening project: /projects/small/small.j3d',
			'Project opened: Small Authoring Project'
		]);
	});

	test('clears state and diagnostics on close', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		client.nextOpen = Promise.resolve(openResult());
		await state.open('/projects/small/small.j3d');
		await state.close();
		assert.deepStrictEqual(state.snapshot, {
			status: 'closed',
			diagnostics: []
		});
		assert.strictEqual(client.closeCalls, 1);
	});

	test('does not create false opened state after a failed open', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		client.nextOpen = Promise.resolve({
			opened: false,
			projectGeneration: null,
			project: null,
			diagnostics: [diagnostic],
			failureCode: null
		});
		await state.open('/projects/broken/broken.j3d');
		assert.deepStrictEqual(state.snapshot, {
			status: 'openFailed',
			diagnostics: [diagnostic],
			failure: 'Project validation failed'
		});
	});

	test('does not apply an open result made stale by close', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		let complete: ((result: ProjectOpenResultDto) => void) | undefined;
		client.nextOpen = new Promise(resolve => complete = resolve);
		const opening = state.open('/projects/small/small.j3d');
		const closing = state.close();
		complete?.(openResult());
		await Promise.all([opening, closing]);
		assert.deepStrictEqual(state.snapshot, {
			status: 'closed',
			diagnostics: []
		});
		assert.strictEqual(client.closeCalls, 1);
	});

	test('does not allow another open until a cancelled open is reconciled with Java', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		let completeOpen: ((result: ProjectOpenResultDto) => void) | undefined;
		let completeClose: (() => void) | undefined;
		client.nextOpen = new Promise(resolve => completeOpen = resolve);
		client.nextClose = new Promise(resolve => completeClose = () => resolve({
			closed: true,
			invalidatedProjectGeneration: 7
		}));

		const opening = state.open('/projects/a/a.j3d');
		const closing = state.close();
		await assert.rejects(state.open('/projects/b/b.j3d'), /already open or changing state/);

		completeOpen?.(openResult());
		await client.closeStarted;
		await assert.rejects(state.open('/projects/b/b.j3d'), /already open or changing state/);
		completeClose?.();
		await Promise.all([opening, closing]);

		client.nextOpen = Promise.resolve(openResult(8));
		await state.open('/projects/b/b.j3d');
		assert.strictEqual(state.snapshot.status, 'open');
		if (state.snapshot.status === 'open') {
			assert.strictEqual(state.snapshot.generation, 8);
		}
	});

	test('does not start compensating project work after disposal', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		let completeOpen: ((result: ProjectOpenResultDto) => void) | undefined;
		client.nextOpen = new Promise(resolve => completeOpen = resolve);
		const opening = state.open('/projects/a/a.j3d');
		state.dispose();
		completeOpen?.(openResult());
		await opening;
		assert.strictEqual(client.closeCalls, 0);
		assert.strictEqual(state.snapshot.status, 'closed');
	});

	test('invalidates active state when the service fails', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		client.nextOpen = Promise.resolve(openResult());
		await state.open('/projects/small/small.j3d');
		client.fail(new Error('service exited'));
		assert.deepStrictEqual(state.snapshot, {
			status: 'serviceUnavailable',
			diagnostics: [],
			failure: 'service exited'
		});
	});

	test('rejects a close acknowledgement for another project generation', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		await state.open('/projects/small/small.j3d');
		client.nextClose = Promise.resolve({ closed: true, invalidatedProjectGeneration: 6 });
		await assert.rejects(state.close(), /expected 7/);
		assert.strictEqual(state.snapshot.status, 'serviceUnavailable');
	});

	test('retains the open project when close fails without losing the service', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		await state.open('/projects/small/small.j3d');
		client.nextClose = Promise.reject(new Error('close failed'));
		await assert.rejects(state.close(), /close failed/);
		assert.strictEqual(state.snapshot.status, 'open');
	});

	test('shares duplicate close work and supports repeated open and close', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		await state.open('/projects/a/a.j3d');
		let completeClose: (() => void) | undefined;
		client.nextClose = new Promise(resolve => completeClose = () => resolve({
			closed: true,
			invalidatedProjectGeneration: 7
		}));
		const firstClose = state.close();
		const secondClose = state.close();
		completeClose?.();
		await Promise.all([firstClose, secondClose]);
		assert.strictEqual(client.closeCalls, 1);

		client.nextOpen = Promise.resolve(openResult(8));
		client.nextClose = Promise.resolve({ closed: true, invalidatedProjectGeneration: 8 });
		await state.open('/projects/b/b.j3d');
		await state.close();
		assert.strictEqual(state.snapshot.status, 'closed');
		assert.strictEqual(client.closeCalls, 2);
	});

	test('projects the opened Java summary into the Project view', () => {
		const nodes = projectTree({
			status: 'open',
			generation: 7,
			project: summary,
			diagnostics: [diagnostic]
		}, labels);
		assert.deepStrictEqual(nodes, [{
			label: 'Small Authoring Project',
			description: '1.0.0',
			children: [
				{ label: 'Name', description: 'Small Authoring Project' },
				{ label: 'ID', description: 'small-project' },
				{ label: 'Version', description: '1.0.0' },
				{ label: 'Descriptor', description: 'small.j3d', tooltip: '/projects/small/small.j3d' },
				{ label: 'Project Root', description: '/projects/small', tooltip: '/projects/small' },
				{ label: 'Startup World', description: 'Main World (world:main)' },
				{ label: 'Authored Assets', description: '3' },
				{ label: 'Projected Assets', description: '4' }
			]
		}]);
	});

	test('preserves diagnostic severity, code, source, and JSON location', () => {
		assert.deepStrictEqual(projectDiagnosticPresentations([diagnostic]), [{
			source: 'file:///projects/small/small.j3d',
			severity: 'warning',
			code: 'project.example',
			message: 'Example warning',
			location: '/assets/0'
		}]);
	});
});

class TestProjectClient implements ProjectAuthoringClient {
	nextOpen: Promise<ProjectOpenResultDto> = Promise.resolve(openResult());
	nextClose: Promise<{ readonly closed: boolean; readonly invalidatedProjectGeneration: number | null }> = Promise.resolve({
		closed: true,
		invalidatedProjectGeneration: 7
	});
	closeCalls = 0;
	private closeStartedResolve: (() => void) | undefined;
	readonly closeStarted = new Promise<void>(resolve => this.closeStartedResolve = resolve);
	private readonly failureListeners = new Set<(error: Error) => void>();

	openProject(): Promise<ProjectOpenResultDto> {
		return this.nextOpen;
	}

	closeProject(): Promise<{ readonly closed: boolean; readonly invalidatedProjectGeneration: number | null }> {
		this.closeCalls++;
		this.closeStartedResolve?.();
		return this.nextClose;
	}

	onDidFail(listener: (error: Error) => void): { dispose(): void } {
		this.failureListeners.add(listener);
		return { dispose: () => this.failureListeners.delete(listener) };
	}

	fail(error: Error): void {
		for (const listener of this.failureListeners) {
			listener(error);
		}
	}
}

class TestLogger {
	readonly lines: string[] = [];

	appendLine(message: string): void {
		this.lines.push(message);
	}
}

const summary: ProjectSummaryDto = {
	id: 'small-project',
	name: 'Small Authoring Project',
	version: '1.0.0',
	root: '/projects/small',
	descriptor: '/projects/small/small.j3d',
	startupWorld: { id: 'world:main', name: 'Main World' },
	assetCounts: { authored: 3, projected: 4 }
};

const diagnostic: ProjectDiagnosticDto = {
	severity: 'warning',
	code: 'project.example',
	message: 'Example warning',
	source: 'file:///projects/small/small.j3d',
	location: '/assets/0',
	details: { asset: 'example' }
};

function openResult(generation = 7): ProjectOpenResultDto {
	return {
		opened: true,
		projectGeneration: generation,
		project: summary,
		diagnostics: [diagnostic],
		failureCode: null
	};
}

const labels: ProjectViewLabels = {
	opening: 'Opening JScene3D project...',
	closing: 'Closing JScene3D project...',
	unavailable: 'Project unavailable',
	openFailed: 'See Problems and JScene3D Output for details',
	noProject: 'No JScene3D project is open',
	name: 'Name',
	id: 'ID',
	version: 'Version',
	descriptor: 'Descriptor',
	projectRoot: 'Project Root',
	startupWorld: 'Startup World',
	authoredAssets: 'Authored Assets',
	projectedAssets: 'Projected Assets'
};
