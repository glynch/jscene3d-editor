/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectOpenResultDto } from '../protocol/authoringProtocol';
import {
	ProjectReopenIntent,
	ProjectReopenIntentStore,
	ProjectWorkspaceHost,
	ProjectWorkspaceLifecycle,
	ProjectWorkspaceResource,
	isExactProjectWorkspace,
	WorkspaceProjectState
} from '../project/projectWorkspaceLifecycle';
import { ProjectSnapshot } from '../project/projectState';

suite('JScene3D project workspace lifecycle', () => {
	test('only one folder exactly matching the Java root is the project workspace', () => {
		assert.deepStrictEqual({
			noWorkspace: isExactProjectWorkspace('file:///projects/small', undefined, undefined),
			exactFolder: isExactProjectWorkspace('file:///projects/small', undefined, ['file:///projects/small']),
			differentFolder: isExactProjectWorkspace('file:///projects/small', undefined, ['file:///projects/other']),
			multiRoot: isExactProjectWorkspace('file:///projects/small', 'file:///projects/work.code-workspace', ['file:///projects/small'])
		}, {
			noWorkspace: false,
			exactFolder: true,
			differentFolder: false,
			multiRoot: false
		});
	});

	test('successful open from no workspace persists intent before requesting the canonical workspace', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/selected/small.j3d' });

		assert.deepStrictEqual({
			opened: result.project.opened,
			workspace: result.workspace,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			opened: true,
			workspace: 'transitionRequested',
			intent: {
				version: 1,
				descriptorUri: 'file:///projects/small/small.j3d',
				projectRootUri: 'file:///projects/small'
			},
			openedWorkspace: resource('/projects/small')
		});
	});

	test('successful open in the canonical workspace does not request another transition', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent();
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/small/small.j3d' });

		assert.deepStrictEqual({
			workspace: result.workspace,
			intent: store.value,
			openedWorkspace: workspace.openedResource,
			log: logger.lines
		}, {
			workspace: 'unchanged',
			intent: undefined,
			openedWorkspace: undefined,
			log: ['Workspace already matches project root: /projects/small']
		});
	});

	test('failed Java open leaves the workspace unchanged and clears stale reopen intent', async () => {
		const state = new TestProjectState();
		state.nextOpen = failedOpenResult();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = intent();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.openProject({ scheme: 'file', fsPath: '/projects/broken/broken.j3d' });

		assert.deepStrictEqual({
			opened: result.project.opened,
			workspace: result.workspace,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			opened: false,
			workspace: 'unchanged',
			intent: undefined,
			openedWorkspace: undefined
		});
	});

	test('activation reopens valid intent in the matching workspace with fresh Java state', async () => {
		const state = new TestProjectState();
		state.nextOpen = openResult(12);
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent('/projects/small/small.j3d', '/projects/small');
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			projectGeneration: state.snapshot.status === 'open' ? state.snapshot.generation : undefined,
			openCalls: state.openCalls,
			intent: store.value,
			openedWorkspace: workspace.openedResource,
			log: logger.lines
		}, {
			result: { status: 'reopened' },
			projectGeneration: 12,
			openCalls: ['/projects/small/small.j3d'],
			intent: undefined,
			openedWorkspace: undefined,
			log: [
				'Reopening JScene3D project after workspace activation: /projects/small/small.j3d',
				'Project reopened: Small Authoring Project'
			]
		});
	});

	test('Java validation failure during reopen clears intent without changing workspace', async () => {
		const state = new TestProjectState();
		state.nextOpen = failedOpenResult();
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent('/projects/broken/broken.j3d', '/projects/broken');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			result: { status: 'failed', reason: 'project.invalid' },
			intent: undefined,
			openedWorkspace: undefined
		});
	});

	test('activation rejects and clears malformed persisted intent without opening Java', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = { version: 1, descriptorUri: 'file:///projects/small/small.j3d' };
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			openCalls: state.openCalls,
			intent: store.value,
			openedWorkspace: workspace.openedResource,
			log: logger.lines
		}, {
			result: { status: 'failed', reason: 'Pending project reopen intent is invalid' },
			openCalls: [],
			intent: undefined,
			openedWorkspace: undefined,
			log: ['Project reopen failed: Pending project reopen intent is invalid']
		});
	});

	test('persisted Java generation is rejected rather than restored as authority', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = { ...intent('/projects/small/small.j3d', '/projects/small'), projectGeneration: 7 };
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			openCalls: state.openCalls,
			intent: store.value
		}, {
			result: { status: 'failed', reason: 'Pending project reopen intent is invalid' },
			openCalls: [],
			intent: undefined
		});
	});

	test('stale intent in another workspace is cleared without opening Java or another workspace', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = intent('/projects/small/small.j3d', '/projects/small');
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			openCalls: state.openCalls,
			intent: store.value,
			openedWorkspace: workspace.openedResource,
			log: logger.lines
		}, {
			result: { status: 'failed', reason: 'Pending project intent does not match the current local workspace' },
			openCalls: [],
			intent: undefined,
			openedWorkspace: undefined,
			log: ['Project reopen failed: Pending project intent does not match the current local workspace']
		});
	});

	test('non-local persisted intent is cleared without opening Java', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = {
			version: 1,
			descriptorUri: 'vscode-remote://ssh-remote/projects/small/small.j3d',
			projectRootUri: 'vscode-remote://ssh-remote/projects/small'
		};
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({ result, openCalls: state.openCalls, intent: store.value }, {
			result: { status: 'failed', reason: 'Pending project intent does not match the current local workspace' },
			openCalls: [],
			intent: undefined
		});
	});

	test('explicit project close clears reopen intent while leaving the workspace in place', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.value = intent('/projects/small/small.j3d', '/projects/small');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		await lifecycle.closeProject();

		assert.deepStrictEqual({
			closeCalls: state.closeCalls,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			closeCalls: 1,
			intent: undefined,
			openedWorkspace: undefined
		});
	});

	test('explicit close still closes Java when intent cleanup fails', async () => {
		const state = new TestProjectState();
		const store = new TestIntentStore();
		store.writeError = new Error('storage failed');
		const lifecycle = new ProjectWorkspaceLifecycle(state, new TestWorkspaceHost(), store, new TestLogger());

		await assert.rejects(lifecycle.closeProject(), /storage failed/);

		assert.strictEqual(state.closeCalls, 1);
	});

	test('external workspace change closes Java state that no longer matches', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot();
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);
		workspace.matches = false;

		workspace.fireChange();
		await state.closeStarted;

		assert.deepStrictEqual({
			closeCalls: state.closeCalls,
			intent: store.value,
			log: logger.lines
		}, {
			closeCalls: 1,
			intent: undefined,
			log: ['Workspace no longer matches open project; closing Java project: Small Authoring Project']
		});
		lifecycle.dispose();
	});

	test('external workspace invalidation still closes Java when intent cleanup fails', async () => {
		const state = new TestProjectState();
		state.snapshot = openSnapshot();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.writeError = new Error('storage failed');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		workspace.fireChange();
		await state.closeStarted;

		assert.strictEqual(state.closeCalls, 1);
		lifecycle.dispose();
	});

	test('workspace establishment failure clears intent and closes the Java project', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		workspace.openError = new Error('workspace failed');
		const store = new TestIntentStore();
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		await assert.rejects(
			lifecycle.openProject({ scheme: 'file', fsPath: '/selected/small.j3d' }),
			/workspace failed/
		);

		assert.deepStrictEqual({
			closeCalls: state.closeCalls,
			intent: store.value,
			log: logger.lines
		}, {
			closeCalls: 1,
			intent: undefined,
			log: [
				'Persisting project reopen intent',
				'Opening project workspace: /projects/small',
				'Project workspace open failed: workspace failed'
			]
		});
	});

	test('reopen-intent persistence failure closes Java before any workspace transition', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		store.writeError = new Error('storage failed');
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		await assert.rejects(
			lifecycle.openProject({ scheme: 'file', fsPath: '/selected/small.j3d' }),
			/storage failed/
		);

		assert.deepStrictEqual({
			closeCalls: state.closeCalls,
			openedWorkspace: workspace.openedResource,
			log: logger.lines
		}, {
			closeCalls: 1,
			openedWorkspace: undefined,
			log: [
				'Persisting project reopen intent',
				'Project reopen intent persistence failed: storage failed'
			]
		});
	});

	test('service failure during activation reopen is one-shot and leaves no pending intent', async () => {
		const state = new TestProjectState();
		state.openError = new Error('service unavailable');
		const workspace = new TestWorkspaceHost();
		workspace.matches = true;
		const store = new TestIntentStore();
		store.value = intent('/projects/small/small.j3d', '/projects/small');
		const logger = new TestLogger();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, logger);

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			intent: store.value,
			openedWorkspace: workspace.openedResource,
			log: logger.lines
		}, {
			result: { status: 'failed', reason: 'service unavailable' },
			intent: undefined,
			openedWorkspace: undefined,
			log: [
				'Reopening JScene3D project after workspace activation: /projects/small/small.j3d',
				'Project reopen failed: service unavailable'
			]
		});
	});

	test('unsupported selected URI starts neither Java nor a workspace transition', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		await assert.rejects(
			lifecycle.openProject({ scheme: 'vscode-remote', fsPath: '/projects/small/small.j3d' }),
			/local file system/
		);

		assert.deepStrictEqual({
			openCalls: state.openCalls,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			openCalls: [],
			intent: undefined,
			openedWorkspace: undefined
		});
	});

	test('changed Java root during reopen closes fresh state without causing a reload loop', async () => {
		const state = new TestProjectState();
		state.nextOpen = openResult(12, '/projects/moved');
		const workspace = new TestWorkspaceHost();
		workspace.matchingUris = new Set(['file:///projects/small']);
		const store = new TestIntentStore();
		store.value = intent('/projects/small/small.j3d', '/projects/small');
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());

		const result = await lifecycle.reopenPendingProject();

		assert.deepStrictEqual({
			result,
			closeCalls: state.closeCalls,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			result: { status: 'failed', reason: 'Java project root does not match the current workspace' },
			closeCalls: 1,
			intent: undefined,
			openedWorkspace: undefined
		});
	});

	test('disposal prevents later project work', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, new TestIntentStore(), new TestLogger());
		lifecycle.dispose();

		await assert.rejects(
			lifecycle.openProject({ scheme: 'file', fsPath: '/projects/small/small.j3d' }),
			/has been disposed/
		);
		assert.deepStrictEqual(state.openCalls, []);
	});

	test('in-flight open result after disposal cannot persist intent or open a workspace', async () => {
		const state = new TestProjectState();
		let completeOpen: ((result: ProjectOpenResultDto) => void) | undefined;
		state.nextOpenPromise = new Promise(resolve => completeOpen = resolve);
		const workspace = new TestWorkspaceHost();
		const store = new TestIntentStore();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());
		const opening = lifecycle.openProject({ scheme: 'file', fsPath: '/projects/small/small.j3d' });
		await state.openStarted;

		lifecycle.dispose();
		completeOpen?.(openResult());
		const result = await opening;

		assert.deepStrictEqual({
			workspace: result.workspace,
			intent: store.value,
			openedWorkspace: workspace.openedResource
		}, {
			workspace: 'unchanged',
			intent: undefined,
			openedWorkspace: undefined
		});
	});

	test('deactivation during an accepted workspace transition preserves reopen intent', async () => {
		const state = new TestProjectState();
		const workspace = new TestWorkspaceHost();
		let failWorkspaceOpen: ((error: Error) => void) | undefined;
		workspace.openPromise = new Promise((_resolve, reject) => failWorkspaceOpen = reject);
		const store = new TestIntentStore();
		const lifecycle = new ProjectWorkspaceLifecycle(state, workspace, store, new TestLogger());
		const opening = lifecycle.openProject({ scheme: 'file', fsPath: '/projects/small/small.j3d' });
		await workspace.openStarted;

		lifecycle.dispose();
		failWorkspaceOpen?.(new Error('extension host stopped'));
		const result = await opening;

		assert.deepStrictEqual({
			workspace: result.workspace,
			intent: store.value,
			closeCalls: state.closeCalls
		}, {
			workspace: 'transitionRequested',
			intent: intent('/projects/small/small.j3d', '/projects/small'),
			closeCalls: 0
		});
	});
});

class TestProjectState implements WorkspaceProjectState {
	snapshot: ProjectSnapshot = { status: 'closed', diagnostics: [] };
	openCalls: string[] = [];
	nextOpen: ProjectOpenResultDto = openResult();
	nextOpenPromise: Promise<ProjectOpenResultDto> | undefined;
	openError: Error | undefined;
	closeCalls = 0;
	private closeStartedResolve: (() => void) | undefined;
	readonly closeStarted = new Promise<void>(resolve => this.closeStartedResolve = resolve);
	private openStartedResolve: (() => void) | undefined;
	readonly openStarted = new Promise<void>(resolve => this.openStartedResolve = resolve);

	open(path: string): Promise<ProjectOpenResultDto> {
		this.openCalls.push(path);
		this.openStartedResolve?.();
		if (this.openError !== undefined) {
			return Promise.reject(this.openError);
		}
		const opening = this.nextOpenPromise ?? Promise.resolve(this.nextOpen);
		return opening.then(result => {
			if (result.opened && result.project !== null && result.projectGeneration !== null) {
				this.snapshot = {
					status: 'open',
					generation: result.projectGeneration,
					project: result.project,
					diagnostics: result.diagnostics
				};
			}
			return result;
		});
	}

	close(): Promise<void> {
		this.closeCalls++;
		this.closeStartedResolve?.();
		return Promise.resolve();
	}
}

class TestWorkspaceHost implements ProjectWorkspaceHost {
	openedResource: ProjectWorkspaceResource | undefined;
	matches = false;
	matchingUris: ReadonlySet<string> | undefined;
	openError: Error | undefined;
	openPromise: Promise<void> | undefined;
	private changeListener: (() => void) | undefined;
	private openStartedResolve: (() => void) | undefined;
	readonly openStarted = new Promise<void>(resolve => this.openStartedResolve = resolve);

	resourceForLocalPath(path: string): ProjectWorkspaceResource {
		return resource(path);
	}

	parseLocalResource(uri: string): ProjectWorkspaceResource | undefined {
		return uri.startsWith('file://') ? { uri, fsPath: uri.slice('file://'.length) } : undefined;
	}

	matchesProjectRoot(resource: ProjectWorkspaceResource): boolean {
		return this.matchingUris?.has(resource.uri) ?? this.matches;
	}

	openProjectRoot(resource: ProjectWorkspaceResource): Promise<void> {
		this.openedResource = resource;
		this.openStartedResolve?.();
		if (this.openError !== undefined) {
			return Promise.reject(this.openError);
		}
		return this.openPromise ?? Promise.resolve();
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
	writeError: Error | undefined;

	read(): unknown {
		return this.value;
	}

	write(value: ProjectReopenIntent | undefined): Promise<void> {
		if (this.writeError !== undefined) {
			return Promise.reject(this.writeError);
		}
		this.value = value;
		return Promise.resolve();
	}
}

class TestLogger {
	readonly lines: string[] = [];

	appendLine(message: string): void {
		this.lines.push(message);
	}
}

function resource(fsPath: string): ProjectWorkspaceResource {
	return { uri: `file://${fsPath}`, fsPath };
}

function openResult(generation = 7, root = '/projects/small'): ProjectOpenResultDto {
	return {
		opened: true,
		projectGeneration: generation,
		project: {
			id: 'small-project',
			name: 'Small Authoring Project',
			version: '1.0.0',
			root,
			descriptor: '/projects/small/small.j3d',
			startupWorld: { id: 'world:main', name: 'Main World' },
			assetCounts: { authored: 3, projected: 4 }
		},
		diagnostics: [],
		failureCode: null
	};
}

function failedOpenResult(): ProjectOpenResultDto {
	return {
		opened: false,
		projectGeneration: null,
		project: null,
		diagnostics: [],
		failureCode: 'project.invalid'
	};
}

function openSnapshot(): ProjectSnapshot {
	const result = openResult();
	if (result.project === null || result.projectGeneration === null) {
		throw new Error('Expected an opened project fixture');
	}
	return {
		status: 'open',
		generation: result.projectGeneration,
		project: result.project,
		diagnostics: result.diagnostics
	};
}

function intent(descriptor = '/projects/old/old.j3d', root = '/projects/old'): ProjectReopenIntent {
	return {
		version: 1,
		descriptorUri: `file://${descriptor}`,
		projectRootUri: `file://${root}`
	};
}
