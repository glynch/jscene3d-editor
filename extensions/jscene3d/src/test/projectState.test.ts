/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	ProjectCloseResultDto,
	ProjectDiagnosticDto,
	ProjectOpenResultDto,
	ProjectReplaceResultDto,
	ProjectSummaryDto
} from '../protocol/authoringProtocol';
import { ProjectAuthoringClient, ProjectState } from '../project/projectState';
import { projectTree, ProjectViewLabels } from '../project/projectViewModel';

suite('JScene3D project state', () => {
	test('opens an accepted Project directly from Java authority', async () => {
		const client = new TestProjectClient();
		const logger = new TestLogger();
		const state = new ProjectState(client, logger);

		const selection = await state.open('/projects/a/a.j3d');

		assert.strictEqual(selection.operation, 'open');
		assert.deepStrictEqual(client.openCalls, ['/projects/a/a.j3d']);
		assert.deepStrictEqual(client.replaceCalls, []);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7, [activeDiagnostic]));
	});

	test('atomically replaces A with valid B using the expected generation', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextReplace = Promise.resolve(replacedResult());

		const selection = await state.open('/projects/b/b.j3d');

		assert.strictEqual(selection.operation, 'replace');
		assert.deepStrictEqual(client.replaceCalls, [{ expectedGeneration: 7, path: '/projects/b/b.j3d' }]);
		assert.strictEqual(client.closeCalls, 0);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryB, 8, [replacementDiagnostic]));
	});

	test('rejected B preserves A and publishes B diagnostics in the attempt scope', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextReplace = Promise.resolve(candidateRejectedResult([attemptDiagnostic]));

		await state.open('/projects/b/b.j3d');

		assert.deepStrictEqual(state.snapshot, {
			...openSnapshot(summaryA, 7, [activeDiagnostic]),
			attemptDiagnostics: [attemptDiagnostic]
		});
	});

	test('a new replacement attempt clears only the previous attempt diagnostics', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextReplace = Promise.resolve(candidateRejectedResult([attemptDiagnostic]));
		await state.open('/projects/b/b.j3d');

		let complete: ((result: ProjectReplaceResultDto) => void) | undefined;
		client.nextReplace = new Promise(resolve => complete = resolve);
		const replacing = state.open('/projects/c/c.j3d');

		assert.deepStrictEqual(state.snapshot, {
			...openSnapshot(summaryA, 7, [activeDiagnostic]),
			status: 'replacing',
			candidatePath: '/projects/c/c.j3d'
		});
		complete?.(candidateRejectedResult([]));
		await replacing;
	});

	test('successful replacement clears attempt diagnostics and replaces active diagnostics', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextReplace = Promise.resolve(candidateRejectedResult([attemptDiagnostic]));
		await state.open('/projects/bad/bad.j3d');
		client.nextReplace = Promise.resolve(replacedResult());

		await state.open('/projects/b/b.j3d');

		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryB, 8, [replacementDiagnostic]));
	});

	test('replacement conflict invalidates untrusted active identity without blaming B', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextReplace = Promise.resolve({
			outcome: 'conflict',
			projectGeneration: null,
			project: null,
			diagnostics: [],
			failureCode: 'authoring.project.generationConflict'
		});

		await state.open('/projects/b/b.j3d');

		assert.deepStrictEqual(state.snapshot, {
			status: 'serviceUnavailable',
			activeDiagnostics: [],
			attemptDiagnostics: [],
			failure: 'authoring.project.generationConflict'
		});
	});

	test('failed initial open has only attempt diagnostics and later success clears them', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		client.nextOpen = Promise.resolve(failedOpenResult([attemptDiagnostic]));

		await state.open('/projects/bad/bad.j3d');
		assert.deepStrictEqual(state.snapshot, {
			status: 'openFailed',
			activeDiagnostics: [],
			attemptDiagnostics: [attemptDiagnostic],
			failure: 'project.invalid'
		});

		client.nextOpen = Promise.resolve(openResult());
		await state.open('/projects/a/a.j3d');
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7, [activeDiagnostic]));
	});

	test('close clears both diagnostic scopes', async () => {
		const client = new TestProjectClient();
		const logger = new TestLogger();
		const state = new ProjectState(client, logger);
		await state.open('/projects/a/a.j3d');
		client.nextReplace = Promise.resolve(candidateRejectedResult([attemptDiagnostic]));
		await state.open('/projects/bad/bad.j3d');

		await state.close();

		assert.deepStrictEqual(state.snapshot, closedSnapshot());
		assert.strictEqual(client.closeCalls, 1);
		assert.ok(logger.lines.includes('Closing project: Project A'));
		assert.ok(logger.lines.includes('Project closed: Project A'));
	});

	test('does not apply an initial open result made stale by close', async () => {
		const client = new TestProjectClient();
		const state = new ProjectState(client, new TestLogger());
		let complete: ((result: ProjectOpenResultDto) => void) | undefined;
		client.nextOpen = new Promise(resolve => complete = resolve);

		const opening = state.open('/projects/a/a.j3d');
		const closing = state.close();
		complete?.(openResult());
		await Promise.all([opening, closing]);

		assert.deepStrictEqual(state.snapshot, closedSnapshot());
		assert.strictEqual(client.closeCalls, 1);
	});

	test('invalidates active state when the service fails', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);

		client.fail(new Error('service exited'));

		assert.deepStrictEqual(state.snapshot, {
			status: 'serviceUnavailable',
			activeDiagnostics: [],
			attemptDiagnostics: [],
			failure: 'service exited'
		});
	});

	test('rejects a close acknowledgement for another generation', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextClose = Promise.resolve({ closed: true, invalidatedProjectGeneration: 6 });

		await assert.rejects(state.close(), /expected 7/);
		assert.strictEqual(state.snapshot.status, 'serviceUnavailable');
	});

	test('retains the project and diagnostics when close fails without losing the service', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		client.nextClose = Promise.reject(new Error('close failed'));

		await assert.rejects(state.close(), /close failed/);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7, [activeDiagnostic]));
	});

	test('suppresses the active project catalog while replacement is in progress', async () => {
		const client = new TestProjectClient();
		const state = await openState(client);
		let complete: ((result: ProjectReplaceResultDto) => void) | undefined;
		client.nextReplace = new Promise(resolve => complete = resolve);
		const replacing = state.open('/projects/b/b.j3d');

		assert.deepStrictEqual(projectTree(state.snapshot, labels), [{ label: 'Opening JScene3D project...' }]);
		complete?.(candidateRejectedResult([]));
		await replacing;
	});

	test('projects Java semantic groups and generation-bound AssetId open commands', () => {
		const root = projectTree(openSnapshot(summaryA, 7, []), labels)[0];
		const scenes = root.children?.[0];
		const entityDefinitions = root.children?.[1];

		assert.strictEqual(scenes?.label, 'Scenes');
		assert.deepStrictEqual(scenes?.children?.[0], {
			label: 'World A',
			description: 'Main Scene',
			tooltip: 'file:///projects/a/content/maps/world-a.scene.json',
			command: {
				command: 'jscene3d.openDefinition',
				title: 'World A',
				arguments: ['world:a', 7]
			}
		});
		assert.strictEqual(entityDefinitions?.label, 'Entity Definitions');
		assert.deepStrictEqual(entityDefinitions?.children?.[0], {
			label: 'Player',
			description: 'Generated · Read-only',
			tooltip: 'published:entities/player',
			command: {
				command: 'jscene3d.openDefinition',
				title: 'Player',
				arguments: ['entity:player', 7]
			}
		});
	});

	test('shows explicit empty states for Projects without Scenes or Entity Definitions', () => {
		const snapshot = openSnapshot({
			...summaryA,
			mainScene: null,
			catalog: { scenes: [], entityDefinitions: [] }
		}, 7, []);

		const groups = projectTree(snapshot, labels)[0].children;

		assert.deepStrictEqual(groups, [
			{ label: 'Scenes', children: [{ label: 'No Scenes' }] },
			{ label: 'Entity Definitions', children: [{ label: 'No Entity Definitions' }] }
		]);
	});

});

class TestProjectClient implements ProjectAuthoringClient {
	nextOpen: Promise<ProjectOpenResultDto> = Promise.resolve(openResult());
	nextReplace: Promise<ProjectReplaceResultDto> = Promise.resolve(replacedResult());
	nextClose: Promise<ProjectCloseResultDto> = Promise.resolve({
		closed: true,
		invalidatedProjectGeneration: 7
	});
	readonly openCalls: string[] = [];
	readonly replaceCalls: { expectedGeneration: number; path: string }[] = [];
	closeCalls = 0;
	private readonly failureListeners = new Set<(error: Error) => void>();

	openProject(path: string): Promise<ProjectOpenResultDto> {
		this.openCalls.push(path);
		return this.nextOpen;
	}

	replaceProject(expectedGeneration: number, path: string): Promise<ProjectReplaceResultDto> {
		this.replaceCalls.push({ expectedGeneration, path });
		return this.nextReplace;
	}

	closeProject(): Promise<ProjectCloseResultDto> {
		this.closeCalls++;
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

async function openState(client: TestProjectClient): Promise<ProjectState> {
	const state = new ProjectState(client, new TestLogger());
	await state.open('/projects/a/a.j3d');
	return state;
}

function openSnapshot(project: ProjectSummaryDto, generation: number, diagnostics: readonly ProjectDiagnosticDto[]) {
	return {
		status: 'open' as const,
		generation,
		project,
		activeDiagnostics: diagnostics,
		attemptDiagnostics: []
	};
}

function closedSnapshot() {
	return { status: 'closed', activeDiagnostics: [], attemptDiagnostics: [] };
}

function openResult(): ProjectOpenResultDto {
	return {
		opened: true,
		projectGeneration: 7,
		project: summaryA,
		diagnostics: [activeDiagnostic],
		failureCode: null
	};
}

function failedOpenResult(diagnostics: readonly ProjectDiagnosticDto[]): ProjectOpenResultDto {
	return {
		opened: false,
		projectGeneration: null,
		project: null,
		diagnostics,
		failureCode: 'project.invalid'
	};
}

function replacedResult(): ProjectReplaceResultDto {
	return {
		outcome: 'replaced',
		projectGeneration: 8,
		project: summaryB,
		diagnostics: [replacementDiagnostic],
		failureCode: null
	};
}

function candidateRejectedResult(diagnostics: readonly ProjectDiagnosticDto[]): ProjectReplaceResultDto {
	return {
		outcome: 'candidateRejected',
		projectGeneration: null,
		project: null,
		diagnostics,
		failureCode: null
	};
}

const summaryA: ProjectSummaryDto = {
	id: 'project-a',
	name: 'Project A',
	version: '1.0.0',
	root: '/projects/a',
	descriptor: '/projects/a/a.j3d',
	mainScene: { id: 'world:a', name: 'World A' },
	assetCounts: { authored: 3, projected: 4 },
	catalog: {
		scenes: [{
			id: 'world:a',
			name: 'World A',
			source: 'file:///projects/a/content/maps/world-a.scene.json',
			origin: 'authored',
			editable: true,
			mainScene: true
		}],
		entityDefinitions: [{
			id: 'entity:player',
			name: 'Player',
			source: 'published:entities/player',
			origin: 'generated',
			editable: false,
			mainScene: false
		}]
	}
};

const summaryB: ProjectSummaryDto = {
	...summaryA,
	id: 'project-b',
	name: 'Project B',
	root: '/projects/b',
	descriptor: '/projects/b/b.j3d'
};

const activeDiagnostic: ProjectDiagnosticDto = {
	severity: 'warning',
	code: 'project.a.warning',
	message: 'A warning',
	source: 'file:///projects/a/a.j3d',
	location: '/assets/0',
	details: {}
};

const attemptDiagnostic: ProjectDiagnosticDto = {
	severity: 'error',
	code: 'project.b.invalid',
	message: 'B is invalid',
	source: 'file:///projects/b/b.j3d',
	location: '/identity',
	details: {}
};

const replacementDiagnostic: ProjectDiagnosticDto = {
	severity: 'warning',
	code: 'project.b.warning',
	message: 'B warning',
	source: 'file:///projects/b/b.j3d',
	location: '/runtime',
	details: {}
};

const labels: ProjectViewLabels = {
	opening: 'Opening JScene3D project...',
	closing: 'Closing JScene3D project...',
	unavailable: 'Project unavailable',
	openFailed: 'See Problems and JScene3D Output for details',
	noProject: 'No JScene3D project is open',
	scenes: 'Scenes',
	entityDefinitions: 'Entity Definitions',
	noScenes: 'No Scenes',
	noEntityDefinitions: 'No Entity Definitions',
	mainScene: 'Main Scene',
	generated: 'Generated',
	readOnly: 'Read-only'
};
