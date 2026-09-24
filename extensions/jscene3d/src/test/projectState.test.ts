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
			diagnostics: [diagnostic],
			failure: null
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
			generation: null,
			project: null,
			diagnostics: [],
			failure: null
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
			status: 'failed',
			generation: null,
			project: null,
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
		await state.close();
		complete?.(openResult());
		await opening;
		assert.deepStrictEqual(state.snapshot, {
			status: 'closed',
			generation: null,
			project: null,
			diagnostics: [],
			failure: null
		});
		assert.strictEqual(client.closeCalls, 1);
	});

	test('invalidates active state when the service fails', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		client.nextOpen = Promise.resolve(openResult());
		await state.open('/projects/small/small.j3d');
		client.fail(new Error('service exited'));
		assert.deepStrictEqual(state.snapshot, {
			status: 'failed',
			generation: null,
			project: null,
			diagnostics: [],
			failure: 'service exited'
		});
	});

	test('projects the opened Java summary into the Project view', () => {
		const nodes = projectTree({
			status: 'open',
			generation: 7,
			project: summary,
			diagnostics: [diagnostic],
			failure: null
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
	closeCalls = 0;
	private readonly failureListeners = new Set<(error: Error) => void>();

	openProject(): Promise<ProjectOpenResultDto> {
		return this.nextOpen;
	}

	closeProject(): Promise<{ readonly closed: boolean; readonly invalidatedProjectGeneration: number | null }> {
		this.closeCalls++;
		return Promise.resolve({ closed: true, invalidatedProjectGeneration: 7 });
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

function openResult(): ProjectOpenResultDto {
	return {
		opened: true,
		projectGeneration: 7,
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
