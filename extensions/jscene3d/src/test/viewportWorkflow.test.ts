/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectSnapshot } from '../project/projectState';
import { ConnectionScopedResult, ViewportLaunchResultDto } from '../protocol/authoringProtocol';
import {
	ProjectViewportLaunch,
	ViewportAuthoringClient,
	ViewportWorkflow,
	ViewportWorkflowHost
} from '../viewport/viewportWorkflow';

suite('JScene3D native viewport workflow', () => {
	test('opens the Java-prepared Main Scene with complete generation identity', async () => {
		const state = new TestProjectState(openSnapshot());
		const client = new TestClient(preparedResult());
		const host = new TestHost();
		const workflow = new ViewportWorkflow(client, state, host, new TestLogger(), () => 'viewport-a');

		await workflow.runProject();

		assert.deepStrictEqual(client.requests, [{ generation: 7, sceneAssetId: 'world:a' }]);
		assert.deepStrictEqual(host.opened, {
			viewportId: 'viewport-a',
			connectionGeneration: 'connection-a',
			projectGeneration: 7,
			projectId: 'project-a',
			projectName: 'Project A',
			projectRoot: '/projects/a',
			publishedContentRoot: '/projects/a/.jscene3d/published',
			engineVersion: '0.1.0-SNAPSHOT',
			sceneAssetId: 'world:a',
			sceneName: 'Scene A',
			runtimeArtifacts: ['/runtime/application.jar']
		});
		assert.deepStrictEqual(host.notifications, []);
	});

	test('does not contact Java or open validation content when no project is open', async () => {
		const client = new TestClient(preparedResult());
		const host = new TestHost();
		const workflow = new ViewportWorkflow(client, new TestProjectState(closedSnapshot()), host, new TestLogger());

		await workflow.runProject();

		assert.deepStrictEqual(client.requests, []);
		assert.deepStrictEqual(host.notifications, ['projectRequired']);
		assert.strictEqual(host.opened, undefined);
	});

	test('rejects Run Project before contacting Java when no Main Scene is configured', async () => {
		const client = new TestClient(preparedResult());
		const host = new TestHost();
		const snapshot = openSnapshot();
		assert.strictEqual(snapshot.status, 'open');
		if (snapshot.status !== 'open') {
			throw new Error('Expected an open project snapshot');
		}
		const workflow = new ViewportWorkflow(
			client,
			new TestProjectState({ ...snapshot, project: { ...snapshot.project, mainScene: null } }),
			host,
			new TestLogger());

		await workflow.runProject();

		assert.deepStrictEqual(client.requests, []);
		assert.deepStrictEqual(host.notifications, ['mainSceneRequired']);
		assert.strictEqual(host.opened, undefined);
	});

	test('reports Java rejection without opening or falling back to the validation cube', async () => {
		const rejected: ConnectionScopedResult<ViewportLaunchResultDto> = {
			connectionGeneration: 'connection-a',
			result: {
				prepared: false,
				launch: null,
				diagnostics: [],
				failureCode: 'authoring.viewport.sceneUnavailable'
			}
		};
		const host = new TestHost();
		const workflow = new ViewportWorkflow(
			new TestClient(rejected), new TestProjectState(openSnapshot()), host, new TestLogger());

		await workflow.runProject();

		assert.strictEqual(host.opened, undefined);
		assert.deepStrictEqual(host.notifications, ['preparationRejected']);
	});

	test('rejects a delayed launch response after the project generation changes', async () => {
		const state = new TestProjectState(openSnapshot());
		const client = new DeferredClient();
		const host = new TestHost();
		const workflow = new ViewportWorkflow(client, state, host, new TestLogger());
		const pending = workflow.runProject();
		state.snapshot = openSnapshot(8);
		client.resolve(preparedResult());

		await pending;

		assert.strictEqual(host.opened, undefined);
		assert.deepStrictEqual(host.notifications, ['stale']);
	});
});

class TestClient implements ViewportAuthoringClient {
	readonly requests: { generation: number; sceneAssetId: string }[] = [];

	constructor(private readonly response: ConnectionScopedResult<ViewportLaunchResultDto>) { }

	prepareViewportLaunch(generation: number, sceneAssetId: string): Promise<ConnectionScopedResult<ViewportLaunchResultDto>> {
		this.requests.push({ generation, sceneAssetId });
		return Promise.resolve(this.response);
	}
}

class DeferredClient implements ViewportAuthoringClient {
	private complete: ((result: ConnectionScopedResult<ViewportLaunchResultDto>) => void) | undefined;

	prepareViewportLaunch(): Promise<ConnectionScopedResult<ViewportLaunchResultDto>> {
		return new Promise(resolve => this.complete = resolve);
	}

	resolve(result: ConnectionScopedResult<ViewportLaunchResultDto>): void {
		this.complete?.(result);
	}
}

class TestProjectState {
	constructor(public snapshot: ProjectSnapshot) { }
}

class TestHost implements ViewportWorkflowHost {
	opened: ProjectViewportLaunch | undefined;
	readonly notifications: string[] = [];

	open(launch: ProjectViewportLaunch): Promise<void> {
		this.opened = launch;
		return Promise.resolve();
	}

	publishDiagnostics(): void { }

	notifyFailure(kind: 'projectRequired' | 'mainSceneRequired' | 'preparationRejected' | 'stale' | 'openFailed'): Promise<void> {
		this.notifications.push(kind);
		return Promise.resolve();
	}
}

class TestLogger {
	appendLine(): void { }
}

function preparedResult(): ConnectionScopedResult<ViewportLaunchResultDto> {
	return {
		connectionGeneration: 'connection-a',
		result: {
			prepared: true,
			launch: {
				projectGeneration: 7,
				projectId: 'project-a',
				projectName: 'Project A',
				projectRoot: '/projects/a',
				publishedContentRoot: '/projects/a/.jscene3d/published',
				engineVersion: '0.1.0-SNAPSHOT',
				sceneAssetId: 'world:a',
				sceneName: 'Scene A',
				runtimeArtifacts: ['/runtime/application.jar']
			},
			diagnostics: [],
			failureCode: null
		}
	};
}

function openSnapshot(generation = 7): ProjectSnapshot {
	return {
		status: 'open',
		generation,
		project: {
			id: 'project-a',
			name: 'Project A',
			version: '1.0.0',
			root: '/projects/a',
			descriptor: '/projects/a/project.j3d',
			mainScene: { id: 'world:a', name: 'Scene A' },
			assetCounts: { authored: 1, projected: 0 },
			catalog: {
				scenes: [{
					id: 'world:a', name: 'Scene A', source: 'file:///projects/a/worlds/a.scene.json',
					origin: 'authored', editable: true, mainScene: true
				}],
				entityDefinitions: []
			}
		},
		activeDiagnostics: [],
		attemptDiagnostics: []
	};
}

function closedSnapshot(): ProjectSnapshot {
	return { status: 'closed', activeDiagnostics: [], attemptDiagnostics: [] };
}
