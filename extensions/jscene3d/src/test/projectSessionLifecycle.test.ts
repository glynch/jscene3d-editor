/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectOpenResultDto, ProjectReplaceResultDto, ProjectSummaryDto } from '../protocol/authoringProtocol';
import {
	CoordinatedProjectDocumentLifecycle,
	ProjectDocumentLifecycle,
	ProjectDocumentPreparation,
	ProjectSessionLifecycle,
	ProjectSessionRecord,
	ProjectSessionRecordStore,
	ProjectSessionResource,
	ProjectSessionResources,
	ProjectViewportLifecycle,
	SessionProjectState
} from '../project/projectSessionLifecycle';
import { ProjectSelectionResult, ProjectSnapshot } from '../project/projectState';

suite('JScene3D Project session lifecycle', () => {
	test('opens a Project once and persists Java-authoritative identity without workspace work', async () => {
		const state = new TestProjectState();
		const store = new TestRecordStore();
		const lifecycle = lifecycleFor(state, store);

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/selected/a.j3d' });

		assert.deepStrictEqual(result, { status: 'opened' });
		assert.deepStrictEqual(state.openCalls, ['/selected/a.j3d']);
		assert.deepStrictEqual(store.value, record(summaryA));
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7));
	});

	test('opening remains independent when an unrelated Code OSS workspace exists', async () => {
		const unrelatedWorkspaceFolders = ['file:///unrelated/source'];
		const state = new TestProjectState();

		await lifecycleFor(state, new TestRecordStore()).openProject({
			scheme: 'file', fsPath: '/projects/a/a.j3d'
		});

		assert.deepStrictEqual(unrelatedWorkspaceFolders, ['file:///unrelated/source']);
		assert.deepStrictEqual(state.openCalls, ['/projects/a/a.j3d']);
	});

	test('failed initial open clears stale persistence and retains no Project', async () => {
		const state = new TestProjectState();
		state.nextSelection = openSelection(failedOpenResult());
		const store = new TestRecordStore();
		store.value = record(summaryA);

		const result = await lifecycleFor(state, store).openProject({ scheme: 'file', fsPath: '/bad/bad.j3d' });

		assert.deepStrictEqual(result, { status: 'openRejected' });
		assert.strictEqual(store.value, undefined);
		assert.deepStrictEqual(state.snapshot, closedSnapshot());
	});

	test('replaces A with B without a workbench transition', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		state.nextSelection = replaceSelection(replacedResult(summaryB, 8));
		const store = new TestRecordStore(events);

		const result = await lifecycleFor(
			state, store, new TestDocuments(events), new TestViewports(events)
		).openProject({ scheme: 'file', fsPath: '/projects/b/b.j3d' });

		assert.deepStrictEqual(result, { status: 'replaced' });
		assert.deepStrictEqual(events, ['document-close', 'viewport-close', 'java-open', 'record-write']);
		assert.deepStrictEqual(store.value, record(summaryB));
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryB, 8));
	});

	test('rejected replacement preserves A and its persisted identity', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		state.nextSelection = replaceSelection(candidateRejectedResult());
		const store = new TestRecordStore();
		store.value = record(summaryA);

		const result = await lifecycleFor(state, store).openProject({ scheme: 'file', fsPath: '/bad/bad.j3d' });

		assert.deepStrictEqual(result, { status: 'candidateRejected' });
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7));
		assert.deepStrictEqual(store.value, record(summaryA));
	});

	test('cancelled document close prevents replacement and session invalidation', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);

		const result = await lifecycleFor(
			state, new TestRecordStore(), new TestDocuments([], false)
		).openProject({ scheme: 'file', fsPath: '/projects/b/b.j3d' });

		assert.deepStrictEqual(result, { status: 'cancelled' });
		assert.deepStrictEqual(state.openCalls, []);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7));
	});

	test('closes documents and viewports before Java and leaves the workbench untouched', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		const store = new TestRecordStore(events);
		store.value = record(summaryA);

		await lifecycleFor(state, store, new TestDocuments(events), new TestViewports(events)).closeProject();

		assert.deepStrictEqual(events, ['document-close', 'viewport-close', 'java-close', 'record-clear']);
		assert.deepStrictEqual(state.snapshot, closedSnapshot());
		assert.strictEqual(store.value, undefined);
	});

	test('close failure preserves Project state and persisted identity', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		state.closeError = new Error('close failed');
		const store = new TestRecordStore();
		store.value = record(summaryA);

		await assert.rejects(lifecycleFor(state, store).closeProject(), /close failed/);

		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7));
		assert.deepStrictEqual(store.value, record(summaryA));
	});

	test('automatic reopen ignores the current workspace and establishes fresh Java generations', async () => {
		const state = new TestProjectState();
		state.nextSelection = openSelection(openResult(summaryB, 12));
		const store = new TestRecordStore();
		store.value = record(summaryB);

		const result = await lifecycleFor(state, store).reopenPersistedProject();

		assert.deepStrictEqual(result, { status: 'reopened' });
		assert.deepStrictEqual(state.openCalls, ['/projects/b/b.j3d']);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryB, 12));
		assert.deepStrictEqual(store.value, record(summaryB));
	});

	test('migrates a legacy workspace-transition intent without validating workspace equivalence', async () => {
		const state = new TestProjectState();
		const store = new TestRecordStore();
		store.value = {
			version: 1, descriptorUri: 'file:///projects/a/a.j3d', projectRootUri: 'file:///projects/a'
		};

		const result = await lifecycleFor(state, store).reopenPersistedProject();

		assert.deepStrictEqual(result, { status: 'reopened' });
		assert.deepStrictEqual(store.value, record(summaryA));
	});

	test('does not bind a persisted record to a different Project identity', async () => {
		const state = new TestProjectState();
		state.nextSelection = openSelection(openResult(summaryB, 12));
		const store = new TestRecordStore();
		store.value = { ...record(summaryB), projectId: 'replaced-on-disk' };

		const result = await lifecycleFor(state, store).reopenPersistedProject();

		assert.deepStrictEqual(result, {
			status: 'failed', reason: 'Persisted Project identity no longer matches the descriptor'
		});
		assert.strictEqual(state.closeCalls, 1);
		assert.strictEqual(store.value, undefined);
	});

	test('coordinates local Inspector preparation before native document close', async () => {
		const events: string[] = [];
		const documents = new CoordinatedProjectDocumentLifecycle(
			new TestDocumentPreparation(events), new TestDocuments(events)
		);

		assert.strictEqual(await documents.closeProjectDocuments(), true);
		assert.deepStrictEqual(events, ['prepare-local-input', 'document-close']);
	});
});

function lifecycleFor(
	state: TestProjectState,
	store: TestRecordStore,
	documents?: ProjectDocumentLifecycle,
	viewports?: ProjectViewportLifecycle
): ProjectSessionLifecycle {
	return new ProjectSessionLifecycle(
		state, new TestResources(), store, new TestLogger(), documents, viewports
	);
}

class TestProjectState implements SessionProjectState {
	snapshot: ProjectSnapshot = closedSnapshot();
	nextSelection: ProjectSelectionResult = openSelection(openResult(summaryA, 7));
	readonly openCalls: string[] = [];
	closeCalls = 0;
	closeError: Error | undefined;

	constructor(private readonly events: string[] = []) { }

	open(path: string): Promise<ProjectSelectionResult> {
		this.openCalls.push(path);
		this.events.push('java-open');
		const selection = this.nextSelection;
		const accepted = acceptedProject(selection);
		if (accepted !== undefined) {
			this.snapshot = openSnapshot(accepted.summary, accepted.generation);
		}
		return Promise.resolve(selection);
	}

	close(): Promise<void> {
		this.closeCalls++;
		this.events.push('java-close');
		if (this.closeError !== undefined) {
			return Promise.reject(this.closeError);
		}
		this.snapshot = closedSnapshot();
		return Promise.resolve();
	}
}

class TestResources implements ProjectSessionResources {
	resourceForLocalPath(path: string): ProjectSessionResource {
		return resource(path);
	}

	parseLocalResource(uri: string): ProjectSessionResource | undefined {
		return uri.startsWith('file://') ? { uri, fsPath: uri.slice('file://'.length) } : undefined;
	}
}

class TestRecordStore implements ProjectSessionRecordStore {
	value: unknown;

	constructor(private readonly events: string[] = []) { }

	read(): unknown {
		return this.value;
	}

	write(value: ProjectSessionRecord | undefined): Promise<void> {
		this.value = value;
		this.events.push(value === undefined ? 'record-clear' : 'record-write');
		return Promise.resolve();
	}
}

class TestDocuments implements ProjectDocumentLifecycle {
	constructor(private readonly events: string[] = [], private readonly accepted = true) { }

	closeProjectDocuments(): Promise<boolean> {
		this.events.push('document-close');
		return Promise.resolve(this.accepted);
	}
}

class TestViewports implements ProjectViewportLifecycle {
	constructor(private readonly events: string[] = []) { }

	closeProjectViewports(): Promise<void> {
		this.events.push('viewport-close');
		return Promise.resolve();
	}
}

class TestDocumentPreparation implements ProjectDocumentPreparation {
	constructor(private readonly events: string[] = []) { }

	prepareForDocumentClose(): Promise<boolean> {
		this.events.push('prepare-local-input');
		return Promise.resolve(true);
	}
}

class TestLogger {
	appendLine(): void { }
}

function resource(fsPath: string): ProjectSessionResource {
	return { uri: `file://${fsPath}`, fsPath };
}

function record(project: ProjectSummaryDto): ProjectSessionRecord {
	return {
		version: 2,
		projectId: project.id,
		descriptorUri: `file://${project.descriptor}`,
		projectRootUri: `file://${project.root}`
	};
}

function openSelection(result: ProjectOpenResultDto): ProjectSelectionResult {
	return { operation: 'open', result };
}

function replaceSelection(result: ProjectReplaceResultDto): ProjectSelectionResult {
	return { operation: 'replace', result };
}

function acceptedProject(selection: ProjectSelectionResult): { summary: ProjectSummaryDto; generation: number } | undefined {
	if (selection.operation === 'open') {
		return selection.result.opened
			? { summary: selection.result.project, generation: selection.result.projectGeneration }
			: undefined;
	}
	return selection.result.outcome === 'replaced'
		? { summary: selection.result.project, generation: selection.result.projectGeneration }
		: undefined;
}

function openResult(project: ProjectSummaryDto, generation: number): ProjectOpenResultDto {
	return { opened: true, projectGeneration: generation, project, diagnostics: [], failureCode: null };
}

function failedOpenResult(): ProjectOpenResultDto {
	return { opened: false, projectGeneration: null, project: null, diagnostics: [], failureCode: 'project.invalid' };
}

function replacedResult(project: ProjectSummaryDto, generation: number): ProjectReplaceResultDto {
	return { outcome: 'replaced', projectGeneration: generation, project, diagnostics: [], failureCode: null };
}

function candidateRejectedResult(): ProjectReplaceResultDto {
	return { outcome: 'candidateRejected', projectGeneration: null, project: null, diagnostics: [], failureCode: null };
}

function openSnapshot(project: ProjectSummaryDto, generation: number): ProjectSnapshot {
	return { status: 'open', generation, project, activeDiagnostics: [], attemptDiagnostics: [] };
}

function closedSnapshot(): ProjectSnapshot {
	return { status: 'closed', activeDiagnostics: [], attemptDiagnostics: [] };
}

const summaryA: ProjectSummaryDto = {
	id: 'project-a',
	name: 'Project A',
	version: '1.0.0',
	root: '/projects/a',
	descriptor: '/projects/a/a.j3d',
	mainScene: { id: 'scene:a', name: 'Scene A' },
	assetCounts: { authored: 1, projected: 0 },
	catalog: {
		scenes: [{
			id: 'scene:a', name: 'Scene A', source: 'file:///projects/a/scenes/a.scene.json',
			origin: 'authored', editable: true, mainScene: true
		}],
		entityDefinitions: []
	}
};

const summaryB: ProjectSummaryDto = {
	...summaryA,
	id: 'project-b',
	name: 'Project B',
	root: '/projects/b',
	descriptor: '/projects/b/b.j3d'
};
