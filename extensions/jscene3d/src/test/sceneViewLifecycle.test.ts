/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionResource } from '../definition/authoredDefinitionState';
import { ConnectionScopedResult, ProjectDiagnosticDto, SceneViewOccurrenceDto, SceneViewReadResultDto, SceneViewSnapshotDto } from '../protocol/authoringProtocol';
import { SceneViewportLaunch, SceneViewAuthoringClient, SceneViewHost, SceneViewLifecycle, SceneViewSelectionEvent } from '../sceneView/sceneViewLifecycle';

suite('JScene3D safe Scene View lifecycle', () => {
	test('opens and updates only Scene definitions with stable revision identity', async () => {
		const client = new TestClient();
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(client, host, new TestLogger(), sequenceIds());

		await lifecycle.synchronize(definition('entity', 'entity-definition', 0));
		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 1));

		assert.deepStrictEqual(client.requests, [
			{ projectGeneration: 7, sceneAssetId: 'scene-a', revision: 0 },
			{ projectGeneration: 7, sceneAssetId: 'scene-a', revision: 1 }
		]);
		assert.strictEqual(host.opened.length, 1);
		assert.strictEqual(host.opened[0].kind, 'scene');
		assert.strictEqual(host.opened[0].snapshot.revision, 0);
		assert.deepStrictEqual(host.ownerResources, ['resource:scene-a']);
		assert.deepStrictEqual(host.updated, [{ viewportId: 'viewport-1', revision: 1 }]);
	});

	test('closing and reopening a Scene creates a fresh renderer session', async () => {
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(new TestClient(), host, new TestLogger(), sequenceIds());

		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		await lifecycle.close('resource:scene-a');
		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));

		assert.deepStrictEqual(host.opened.map(launch => launch.viewportId), ['viewport-1', 'viewport-2']);
		assert.deepStrictEqual(host.closed, ['viewport-1']);
	});

	test('reactivating an unchanged open Scene neither reprojects nor relaunches it', async () => {
		const client = new TestClient();
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(client, host, new TestLogger(), sequenceIds());

		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));

		assert.strictEqual(client.requests.length, 1);
		assert.strictEqual(host.opened.length, 1);
		assert.deepStrictEqual(host.updated, []);
	});

	test('project invalidation closes every retained Scene session', async () => {
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(new TestClient(), host, new TestLogger(), sequenceIds());

		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		await lifecycle.synchronize(definition('scene-b', 'scene-definition', 0));
		await lifecycle.closeAll();

		assert.deepStrictEqual(host.closed, ['viewport-1', 'viewport-2']);
	});

	test('keeps concurrent Scene documents independent and closes only their owned viewport', async () => {
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(new TestClient(), host, new TestLogger(), sequenceIds());

		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		await lifecycle.synchronize(definition('scene-b', 'scene-definition', 0));
		await lifecycle.close('resource:scene-a');

		assert.deepStrictEqual(host.opened.map(launch => [launch.viewportId, launch.sceneAssetId]), [
			['viewport-1', 'scene-a'],
			['viewport-2', 'scene-b']
		]);
		assert.deepStrictEqual(host.closed, ['viewport-1']);
	});

	test('discards a delayed projection superseded by a newer definition revision', async () => {
		const client = new DeferredClient();
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(client, host, new TestLogger(), sequenceIds());
		const oldRequest = lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		const newRequest = lifecycle.synchronize(definition('scene-a', 'scene-definition', 1));

		client.resolve(1, projected('scene-a', 1));
		const newOutcome = await newRequest;
		client.resolve(0, projected('scene-a', 0));
		const oldOutcome = await oldRequest;

		assert.deepStrictEqual({
			newOutcome,
			oldOutcome,
			openedRevisions: host.opened.map(launch => launch.snapshot.revision),
			updated: host.updated
		}, {
			newOutcome: { status: 'opened' },
			oldOutcome: { status: 'obsolete' },
			openedRevisions: [1],
			updated: []
		});
	});

	test('returns a useful failure while retaining timestamped projection diagnostics', async () => {
		const logger = new TestLogger();
		const lifecycle = new SceneViewLifecycle({
			readSceneView: async () => ({
				connectionGeneration: 'connection-a',
				result: {
					accepted: false,
					projectGeneration: null,
					sceneAssetId: 'scene-a',
					requestedRevision: 0,
					outcome: null,
					currentRevision: null,
					snapshot: null,
					launch: null,
					diagnostics: [],
					failureCode: 'scene-view.invalid'
				}
			})
		}, new TestHost(), logger, sequenceIds());

		const outcome = await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));

		assert.deepStrictEqual(outcome, {
			status: 'failed',
			reason: 'Scene projection was rejected: scene-view.invalid'
		});
		assert.deepStrictEqual(logger.messages.map(message => message.replace(/^\[[^\]]+\] /, '')), [
			'[Scene View] projection requested for scene-a revision 0',
			'[Scene View] projection completed for scene-a revision 0: scene-view.invalid'
		]);
	});

	test('reopens a Scene View that the user closed independently', async () => {
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(new TestClient(), host, new TestLogger(), sequenceIds());

		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 0));
		host.viewportAvailable = false;
		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 1));

		assert.deepStrictEqual(host.opened.map(launch => [launch.viewportId, launch.snapshot.revision]), [
			['viewport-1', 0],
			['viewport-2', 1]
		]);
	});

	test('synchronizes one stable authored occurrence to the exact Scene revision', async () => {
		const host = new TestHost();
		const lifecycle = new SceneViewLifecycle(new TestClient(), host, new TestLogger(), sequenceIds());
		const scene = definition('scene-a', 'scene-definition', 2);
		const occurrence = { definitionAssetId: 'scene-a', entityPath: ['environment', 'crate'] };

		await lifecycle.synchronize(scene);
		await lifecycle.select(scene, occurrence);
		await lifecycle.select(definition('scene-a', 'scene-definition', 1), occurrence);

		assert.deepStrictEqual(host.selected, [{
			viewportId: 'viewport-1',
			revision: 2,
			occurrence: { rootDefinitionAssetId: 'scene-a', entityPath: ['environment', 'crate'] }
		}]);
	});

	test('resolves viewport selection only for the current session and revision', async () => {
		const lifecycle = new SceneViewLifecycle(new TestClient(), new TestHost(), new TestLogger(), sequenceIds());
		await lifecycle.synchronize(definition('scene-a', 'scene-definition', 2));
		const current = selectionEvent({ revision: 2 });
		const stale = selectionEvent({ revision: 1 });

		assert.deepStrictEqual(lifecycle.resolveSelection(current), {
			resource: 'resource:scene-a',
			occurrence: { definitionAssetId: 'scene-a', entityPath: ['crate'] }
		});
		assert.strictEqual(lifecycle.resolveSelection(stale), undefined);
		assert.strictEqual(lifecycle.resolveSelection(selectionEvent({ viewportId: 'another' })), undefined);
	});
});

class TestClient implements SceneViewAuthoringClient {
	readonly requests: { projectGeneration: number; sceneAssetId: string; revision: number }[] = [];

	readSceneView(projectGeneration: number, sceneAssetId: string, revision: number): Promise<ConnectionScopedResult<SceneViewReadResultDto>> {
		this.requests.push({ projectGeneration, sceneAssetId, revision });
		return Promise.resolve(projected(sceneAssetId, revision));
	}
}

class DeferredClient implements SceneViewAuthoringClient {
	private readonly completions: ((result: ConnectionScopedResult<SceneViewReadResultDto>) => void)[] = [];

	readSceneView(): Promise<ConnectionScopedResult<SceneViewReadResultDto>> {
		return new Promise(resolve => this.completions.push(resolve));
	}

	resolve(index: number, result: ConnectionScopedResult<SceneViewReadResultDto>): void {
		this.completions[index](result);
	}
}

class TestHost implements SceneViewHost {
	readonly opened: SceneViewportLaunch[] = [];
	readonly ownerResources: string[] = [];
	readonly updated: { viewportId: string; revision: number }[] = [];
	readonly selected: { viewportId: string; revision: number; occurrence: SceneViewOccurrenceDto | null }[] = [];
	readonly closed: string[] = [];
	viewportAvailable = true;

	open(ownerResource: string, launch: SceneViewportLaunch): Promise<void> {
		this.ownerResources.push(ownerResource);
		this.opened.push(launch);
		return Promise.resolve();
	}

	update(viewportId: string, snapshot: SceneViewSnapshotDto): Promise<boolean | undefined> {
		if (!this.viewportAvailable) {
			this.viewportAvailable = true;
			return Promise.resolve(undefined);
		}
		this.updated.push({ viewportId, revision: snapshot.revision });
		return Promise.resolve(true);
	}

	select(viewportId: string, revision: number, occurrence: SceneViewOccurrenceDto | null): Promise<boolean | undefined> {
		this.selected.push({ viewportId, revision, occurrence });
		return Promise.resolve(true);
	}

	close(viewportId: string): Promise<void> {
		this.closed.push(viewportId);
		return Promise.resolve();
	}

	publishDiagnostics(_diagnostics: readonly ProjectDiagnosticDto[]): void { }
}

class TestLogger {
	readonly messages: string[] = [];
	appendLine(message: string): void { this.messages.push(message); }
}

function definition(assetId: string, kind: 'scene-definition' | 'entity-definition', revision: number): AuthoredDefinitionResource {
	return {
		resource: `resource:${assetId}`,
		projectGeneration: 7,
		assetId,
		snapshot: {
			revision,
			context: {
				assetId,
				kind,
				origin: 'authored',
				editable: true,
				source: `file:///project/${assetId}.json`,
				label: { kind: 'literal', text: assetId, messageCode: null, arguments: [] }
			},
			roots: []
		}
	};
}

function projected(sceneAssetId: string, revision: number): ConnectionScopedResult<SceneViewReadResultDto> {
	return {
		connectionGeneration: 'connection-a',
		result: {
			accepted: true,
			projectGeneration: 7,
			sceneAssetId,
			requestedRevision: revision,
			outcome: 'projected',
			currentRevision: revision,
			snapshot: { sceneAssetId, revision, occurrences: [] },
			launch: {
				projectId: 'project-a',
				projectName: 'Project A',
				projectRoot: '/project',
				publishedContentRoot: '/project/.jscene3d/published',
				engineVersion: '0.1.0-SNAPSHOT',
				sceneName: sceneAssetId
			},
			diagnostics: [],
			failureCode: null
		}
	};
}

function sequenceIds(): () => string {
	let next = 1;
	return () => `viewport-${next++}`;
}

function selectionEvent(overrides: Partial<SceneViewSelectionEvent>): SceneViewSelectionEvent {
	return {
		viewportId: 'viewport-1',
		connectionGeneration: 'connection-a',
		projectGeneration: 7,
		sceneAssetId: 'scene-a',
		revision: 2,
		occurrence: { rootDefinitionAssetId: 'scene-a', entityPath: ['crate'] },
		...overrides
	};
}
