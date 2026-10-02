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
	ProjectReopenIntent,
	ProjectReopenIntentStore,
	ProjectWorkspaceHost,
	ProjectWorkspaceLifecycle,
	ProjectWorkspaceResource,
	ProjectViewportLifecycle,
	isExactProjectWorkspace,
	WorkspaceProjectState
} from '../project/projectWorkspaceLifecycle';
import { ProjectSelectionResult, ProjectSnapshot } from '../project/projectState';

suite('JScene3D project workspace lifecycle', () => {
	test('only one folder exactly matching the Java root is the project workspace', () => {
		assert.deepStrictEqual({
			noWorkspace: isExactProjectWorkspace('file:///projects/a', undefined, undefined),
			exactFolder: isExactProjectWorkspace('file:///projects/a', undefined, ['file:///projects/a']),
			differentFolder: isExactProjectWorkspace('file:///projects/a', undefined, ['file:///projects/b']),
			multiRoot: isExactProjectWorkspace('file:///projects/a', 'file:///projects/work.code-workspace', ['file:///projects/a'])
		}, {
			noWorkspace: false,
			exactFolder: true,
			differentFolder: false,
			multiRoot: false
		});
	});

	test('successful initial open persists intent before requesting the canonical workspace', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/selected/a.j3d' });

		assert.strictEqual(result.status, 'opened');
		assert.strictEqual(result.workspace, 'transitionRequested');
		assert.deepStrictEqual(store.value, intent('/projects/a/a.j3d', '/projects/a'));
		assert.deepStrictEqual(workspace.openedResource, resource('/projects/a'));
	});

	test('failed initial open leaves workspace unchanged and clears stale intent', async () => {
		const state = new TestProjectState();
		state.nextSelection = openSelection(failedOpenResult());
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = intent();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/bad/bad.j3d' });

		assert.strictEqual(result.status, 'openRejected');
		assert.strictEqual(result.workspace, 'unchanged');
		assert.strictEqual(store.value, undefined);
		assert.strictEqual(workspace.openedResource, undefined);
	});

	test('rejected replacement preserves A workspace and requests no transition', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		state.nextSelection = replaceSelection(candidateRejectedResult());
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent('/projects/a/a.j3d', '/projects/a');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/bad/bad.j3d' });

		assert.strictEqual(result.status, 'candidateRejected');
		assert.strictEqual(result.workspace, 'unchanged');
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7));
		assert.strictEqual(workspace.openedResource, undefined);
		assert.deepStrictEqual(store.value, intent('/projects/a/a.j3d', '/projects/a'));
	});

	test('normalizes a replacement generation conflict without changing the workspace', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		state.nextSelection = replaceSelection({
			outcome: 'conflict',
			projectGeneration: null,
			project: null,
			diagnostics: [],
			failureCode: 'authoring.project.generationConflict'
		});
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent('/projects/a/a.j3d', '/projects/a');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/b/b.j3d' });

		assert.deepStrictEqual(result, { status: 'conflict', workspace: 'unchanged' });
		assert.strictEqual(workspace.openedResource, undefined);
		assert.deepStrictEqual(store.value, intent('/projects/a/a.j3d', '/projects/a'));
	});

	test('successful replacement with a different root persists B intent and opens B workspace', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		state.nextSelection = replaceSelection(replacedResult(summaryB, 8));
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/b/b.j3d' });

		assert.strictEqual(result.status, 'replaced');
		assert.strictEqual(result.workspace, 'transitionRequested');
		assert.deepStrictEqual(store.value, intent('/projects/b/b.j3d', '/projects/b'));
		assert.deepStrictEqual(workspace.openedResource, resource('/projects/b'));
		assert.ok(logger.lines.includes('Opening replacement workspace: /projects/b'));
	});

	test('successful replacement with the current root updates the retained B reopen record without reload', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		const sameRootB = { ...summaryB, root: summaryA.root, descriptor: '/projects/a/b.j3d' };
		state.nextSelection = replaceSelection(replacedResult(sameRootB, 8));
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/a/b.j3d' });

		assert.strictEqual(result.status, 'replaced');
		assert.strictEqual(result.workspace, 'unchanged');
		assert.deepStrictEqual(store.value, intent('/projects/a/b.j3d', '/projects/a'));
		assert.strictEqual(workspace.openedResource, undefined);
		assert.deepStrictEqual(state.snapshot, openSnapshot(sameRootB, 8));
	});

	test('closes authored documents and the old viewport before replacing the Java generation', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		state.nextSelection = replaceSelection(replacedResult(summaryB, 8));
		const workspace = new TestWorkspaceHost(events);
		workspace.matches = true;
		const lifecycle = new ProjectWorkspaceLifecycle(
			state,
			workspace,
			new TestIntentStore(events),
			new TestLogger(),
			new TestDocuments(events),
			new TestViewports(events));

		await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/b/b.j3d' });

		assert.deepStrictEqual(events, ['document-close', 'viewport-close', 'java-open']);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryB, 8));
	});

	test('close waits for Java state, clears intent, then closes the workspace', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		const workspace = new TestWorkspaceHost(events);
		const store = new TestIntentStore(events);
		store.value = intent('/projects/a/a.j3d', '/projects/a');
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		await lifecycle.closeProject();

		assert.deepStrictEqual(events, ['java-close', 'intent-clear', 'workspace-close']);
		assert.strictEqual(workspace.closeCalls, 1);
		assert.deepStrictEqual(state.snapshot, closedSnapshot());
		assert.ok(logger.lines.includes('Closing project workspace'));
	});

	test('closes native authored documents before destroying Java state', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		const lifecycle = new ProjectWorkspaceLifecycle(
			state, new TestWorkspaceHost(events), new TestIntentStore(events), new TestLogger(), new TestDocuments(events));

		await lifecycle.closeProject();

		assert.deepStrictEqual(events, ['document-close', 'java-close', 'intent-clear', 'workspace-close']);
	});

	test('closes native project viewports before documents and Java state', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		const lifecycle = new ProjectWorkspaceLifecycle(
			state,
			new TestWorkspaceHost(events),
			new TestIntentStore(events),
			new TestLogger(),
			new TestDocuments(events),
			new TestViewports(events));

		await lifecycle.closeProject();

		assert.deepStrictEqual(events, [
			'document-close', 'viewport-close', 'java-close', 'intent-clear', 'workspace-close'
		]);
	});

	test('commits valid focused Inspector input before starting native dirty-document close', async () => {
		const events: string[] = [];
		const documents = new CoordinatedProjectDocumentLifecycle(
			new TestDocumentPreparation(events), new TestDocuments(events));

		const accepted = await documents.closeProjectDocuments();

		assert.strictEqual(accepted, true);
		assert.deepStrictEqual(events, ['prepare-local-input', 'document-close']);
	});

	test('invalid focused Inspector input remains local and prevents native document close', async () => {
		const events: string[] = [];
		const documents = new CoordinatedProjectDocumentLifecycle(
			new TestDocumentPreparation(events, false), new TestDocuments(events));

		const accepted = await documents.closeProjectDocuments();

		assert.strictEqual(accepted, false);
		assert.deepStrictEqual(events, ['prepare-local-input']);
	});

	test('native Cancel or save failure propagates after valid Inspector preparation', async () => {
		const events: string[] = [];
		const documents = new CoordinatedProjectDocumentLifecycle(
			new TestDocumentPreparation(events), new TestDocuments(events, false));

		const accepted = await documents.closeProjectDocuments();

		assert.strictEqual(accepted, false);
		assert.deepStrictEqual(events, ['prepare-local-input', 'document-close']);
	});

	test('cancelled native document close preserves Java project and workspace', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		const workspace = new TestWorkspaceHost();
		const lifecycle = new ProjectWorkspaceLifecycle(
			state, workspace, new TestIntentStore(), new TestLogger(), new TestDocuments([], false));

		await lifecycle.closeProject();

		assert.strictEqual(state.closeCalls, 0);
		assert.strictEqual(workspace.closeCalls, 0);
		assert.strictEqual(state.snapshot.status, 'open');
	});

	test('cancelled document close prevents project replacement', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		const lifecycle = new ProjectWorkspaceLifecycle(
			state, new TestWorkspaceHost(), new TestIntentStore(), new TestLogger(), new TestDocuments([], false));

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/b/b.j3d' });

		assert.deepStrictEqual(result, { status: 'cancelled', workspace: 'unchanged' });
		assert.deepStrictEqual(state.openCalls, []);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryA, 7));
	});

	test('close failure leaves workspace open and intent intact', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		state.closeError = new Error('close failed');
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = intent('/projects/a/a.j3d', '/projects/a');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		await assert.rejects(lifecycle.closeProject(), /close failed/);

		assert.strictEqual(workspace.closeCalls, 0);
		assert.deepStrictEqual(store.value, intent('/projects/a/a.j3d', '/projects/a'));
	});

	test('workspace close failure is reported after Java state closes', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot(summaryA, 7);
		const workspace = new TestWorkspaceHost();
		workspace.closeError = new Error('host close failed');
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, new TestIntentStore(), logger);

		await assert.rejects(lifecycle.closeProject(), /host close failed/);

		assert.deepStrictEqual(state.snapshot, closedSnapshot());
		assert.strictEqual(workspace.closeCalls, 1);
		assert.deepStrictEqual(logger.lines.slice(-2), [
			'Closing project workspace',
			'Project workspace close failed: host close failed'
		]);
	});

	test('activation reopens persisted B with fresh ordinary-open authority and retains its restart record', async () => {
		const state = new TestProjectState();
		state.nextSelection = openSelection(openResult(summaryB, 12));
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent('/projects/b/b.j3d', '/projects/b');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual(result, { status: 'reopened' });
		assert.deepStrictEqual(state.openCalls, ['/projects/b/b.j3d']);
		assert.deepStrictEqual(state.snapshot, openSnapshot(summaryB, 12));
		assert.deepStrictEqual(store.value, intent('/projects/b/b.j3d', '/projects/b'));
	});

	test('invalid persisted intent is cleared without Java or workspace work', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = { version: 1, descriptorUri: 'file:///projects/a/a.j3d' };
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual(result, { status: 'failed', reason: 'Pending project reopen intent is invalid' });
		assert.deepStrictEqual(state.openCalls, []);
		assert.strictEqual(store.value, undefined);
	});

	test('workspace transition failure clears intent and closes accepted Java project', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		workspace.openError = new Error('workspace failed');
		const store = new TestIntentStore();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		await assert.rejects(lifecycle.openProject({ scheme: 'file', fsPath: '/projects/a/a.j3d' }), /workspace failed/);

		assert.strictEqual(state.closeCalls, 1);
		assert.strictEqual(store.value, undefined);
	});

	test('external workspace change closes Java project without recursively closing workspace', async () => {
		const events: string[] = [];
		const state = new TestProjectState(events);
		state.snapshot = openSnapshot(summaryA, 7);
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const lifecycle = new ProjectWorkspaceLifecycle(
			state,
			workspace,
			new TestIntentStore(),
			new TestLogger(),
			new TestDocuments([], true),
			new TestViewports(events));
		workspace.matches = false;

		workspace.fireChange();
		await state.closeStarted;

		assert.strictEqual(state.closeCalls, 1);
		assert.strictEqual(workspace.closeCalls, 0);
		assert.deepStrictEqual(events, ['viewport-close', 'java-close']);
		lifecycle.dispose();
	});
});

class TestProjectState implements WorkspaceProjectState {
	snapshot: ProjectSnapshot = closedSnapshot();
	nextSelection: ProjectSelectionResult = openSelection(openResult(summaryA, 7));
	readonly openCalls: string[] = [];
	closeCalls = 0;
	closeError: Error | undefined;
	private closeStartedResolve: (() => void) | undefined;
	readonly closeStarted = new Promise<void>(resolve => this.closeStartedResolve = resolve);

	constructor(private readonly events: string[] = []) { }

	open(path: string): Promise<ProjectSelectionResult> {
		this.openCalls.push(path);
		this.events.push('java-open');
		const selection = this.nextSelection;
		const project = acceptedProject(selection);
		if (project !== undefined) {
			this.snapshot = openSnapshot(project.summary, project.generation);
		}
		return Promise.resolve(selection);
	}

	close(): Promise<void> {
		this.closeCalls++;
		this.closeStartedResolve?.();
		this.events.push('java-close');
		if (this.closeError !== undefined) {
			return Promise.reject(this.closeError);
		}
		this.snapshot = closedSnapshot();
		return Promise.resolve();
	}
}

class TestWorkspaceHost implements ProjectWorkspaceHost {
	openedResource: ProjectWorkspaceResource | undefined;
	matches = false;
	openError: Error | undefined;
	closeError: Error | undefined;
	closeCalls = 0;
	private changeListener: (() => void) | undefined;

	constructor(private readonly events: string[] = []) { }

	resourceForLocalPath(path: string): ProjectWorkspaceResource {
		return resource(path);
	}

	parseLocalResource(uri: string): ProjectWorkspaceResource | undefined {
		return uri.startsWith('file://') ? { uri, fsPath: uri.slice('file://'.length) } : undefined;
	}

	matchesProjectRoot(): boolean {
		return this.matches;
	}

	openProjectRoot(resource: ProjectWorkspaceResource): Promise<void> {
		this.openedResource = resource;
		return this.openError === undefined ? Promise.resolve() : Promise.reject(this.openError);
	}

	closeProjectWorkspace(): Promise<void> {
		this.closeCalls++;
		this.events.push('workspace-close');
		return this.closeError === undefined ? Promise.resolve() : Promise.reject(this.closeError);
	}

	onDidChangeWorkspace(listener: () => void): { dispose(): void } {
		this.changeListener = listener;
		return { dispose: () => this.changeListener = undefined };
	}

	fireChange(): void {
		this.changeListener?.();
	}
}

class TestIntentStore implements ProjectReopenIntentStore {
	value: unknown;

	constructor(private readonly events: string[] = []) { }

	read(): unknown {
		return this.value;
	}

	write(value: ProjectReopenIntent | undefined): Promise<void> {
		this.value = value;
		if (value === undefined) {
			this.events.push('intent-clear');
		}
		return Promise.resolve();
	}
}

class TestLogger {
	readonly lines: string[] = [];

	appendLine(message: string): void {
		this.lines.push(message);
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
	constructor(private readonly events: string[] = [], private readonly accepted = true) { }

	prepareForDocumentClose(): Promise<boolean> {
		this.events.push('prepare-local-input');
		return Promise.resolve(this.accepted);
	}
}

function resource(fsPath: string): ProjectWorkspaceResource {
	return { uri: `file://${fsPath}`, fsPath };
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

function intent(descriptor = '/projects/old/old.j3d', root = '/projects/old'): ProjectReopenIntent {
	return { version: 1, descriptorUri: `file://${descriptor}`, projectRootUri: `file://${root}` };
}

const summaryA: ProjectSummaryDto = {
	id: 'project-a',
	name: 'Project A',
	version: '1.0.0',
	root: '/projects/a',
	descriptor: '/projects/a/a.j3d',
	startupWorld: { id: 'world:a', name: 'World A' },
	assetCounts: { authored: 1, projected: 0 }
};

const summaryB: ProjectSummaryDto = {
	...summaryA,
	id: 'project-b',
	name: 'Project B',
	root: '/projects/b',
	descriptor: '/projects/b/b.j3d'
};
