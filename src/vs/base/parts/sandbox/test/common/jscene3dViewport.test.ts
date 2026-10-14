/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { JScene3DViewportFrameRouter, isSceneTransformPointer, isSceneTransformSettings, isSceneViewNavigation, isSceneViewSelectableOccurrence, isViewportCameraState, isViewportFrameIdentity, isViewportLaunch, sceneTransformConfigCommand, sceneTransformPointerCommand, sceneViewNavigationCommand, stopViewportSessions } from '../../common/jscene3dViewport.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';

suite('JScene3DViewportFrameRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('accepts only complete Java-prepared project launches', () => {
		const launch = {
			kind: 'game',
			viewportId: 'viewport-a',
			connectionGeneration: 'connection-a',
			projectGeneration: 7,
			projectId: 'example.project',
			projectName: 'Example',
			projectRoot: '/projects/example',
			publishedContentRoot: '/projects/example/target/import-cache',
			engineVersion: '0.1.0-SNAPSHOT',
			sceneAssetId: '2f26576c-570d-4338-bc30-52bc41def3a5',
			sceneName: 'Opening Scene',
			runtimeArtifacts: ['/runtime/application.jar']
		};

		assert.strictEqual(isViewportLaunch(launch), true);
		assert.strictEqual(isViewportLaunch({ ...launch, projectGeneration: 0 }), false);
		assert.strictEqual(isViewportLaunch({ ...launch, runtimeArtifacts: ['/runtime/application.jar', ''] }), false);
		const { runtimeArtifacts: _runtimeArtifacts, ...base } = launch;
		const sceneLaunch = {
			...base,
			kind: 'scene',
			snapshot: { sceneAssetId: launch.sceneAssetId, revision: 3, occurrences: [] }
		};
		assert.strictEqual(isViewportLaunch(sceneLaunch), true);
		assert.strictEqual(isViewportLaunch({ ...sceneLaunch, runtimeArtifacts: ['/runtime/application.jar'] }), false);
		assert.strictEqual(isViewportLaunch({ ...sceneLaunch, snapshot: { ...sceneLaunch.snapshot, sceneAssetId: 'stale' } }), false);

		const occurrence = { rootDefinitionAssetId: launch.sceneAssetId, entityPath: ['entity-a'] };
		const identity = {
			occurrence,
			scope: { definitionAssetId: 'definition-a', anchor: occurrence },
			authoredEntityId: 'entity-a',
			componentId: 'component-a'
		};
		const richSceneLaunch = {
			...sceneLaunch,
			snapshot: {
				...sceneLaunch.snapshot,
				occurrences: [{
					occurrence,
					parent: null,
					authoredAssetId: 'definition-a',
					authoredSource: 'file:///project/scene.json',
					authoredEntityId: 'entity-a',
					name: 'Entity',
					enabled: true,
					transform: {
						identity,
						position: { x: '1', y: '2.5', z: '-3' },
						orientationDegrees: { x: '0', y: '90', z: '0' },
						scale: { x: '1', y: '1', z: '1' }
					},
					meshes: [{
						identity,
						mesh: { kind: 'project', locator: 'mesh', projectPath: '/project/mesh.json' },
						material: { kind: 'asset', locator: 'material', projectPath: null },
						visible: true
					}],
					directionalLight: null
				}]
			}
		};
		assert.strictEqual(isViewportLaunch(richSceneLaunch), true);
		const rootOccurrence = { rootDefinitionAssetId: launch.sceneAssetId, entityPath: [] };
		assert.strictEqual(isViewportLaunch({
			...richSceneLaunch,
			snapshot: {
				...richSceneLaunch.snapshot,
				occurrences: [{
					...richSceneLaunch.snapshot.occurrences[0],
					occurrence: rootOccurrence,
					transform: null,
					meshes: [],
					directionalLight: null
				}, {
					...richSceneLaunch.snapshot.occurrences[0],
					parent: rootOccurrence,
					transform: {
						...richSceneLaunch.snapshot.occurrences[0].transform,
						identity: {
							...identity,
							scope: { definitionAssetId: launch.sceneAssetId, anchor: rootOccurrence }
						}
					}
				}]
			}
		}), true, 'accepts the Java-authoritative Scene root occurrence with an empty entity path');
		assert.strictEqual(isSceneViewSelectableOccurrence(rootOccurrence), false);
		assert.strictEqual(isSceneViewSelectableOccurrence(occurrence), true);
		assert.strictEqual(isViewportLaunch({
			...richSceneLaunch,
			snapshot: {
				...richSceneLaunch.snapshot,
				occurrences: [{
					...richSceneLaunch.snapshot.occurrences[0],
					transform: {
						...richSceneLaunch.snapshot.occurrences[0].transform,
						position: { x: '0x10', y: '0', z: '0' }
					}
				}]
			}
		}), false);
	});

	test('rejects malformed identities and frames from another session', async () => {
		const frames: number[] = [];
		const router = new JScene3DViewportFrameRouter<number>();
		assert.strictEqual(router.register('pane-a', { onFrame: async frame => { frames.push(frame); }, onFailure: () => undefined }), true);
		assert.strictEqual(router.bindSession('pane-a', { sessionId: 1, rendererGeneration: 2 }), true);

		assert.strictEqual(isViewportFrameIdentity({ paneId: 'pane-a' }), false);
		assert.strictEqual(await router.route(1, { paneId: 'pane-a' }), false);
		assert.strictEqual(await router.route(2, { paneId: 'pane-a', sessionId: 9, rendererGeneration: 2, presentationGeneration: 0, surfaceGeneration: 1, frameNumber: 1 }), false);
		assert.deepStrictEqual(frames, []);
	});

	test('validates bounded Scene View navigation operations', () => {
		assert.strictEqual(isSceneViewNavigation({ kind: 'orbit', horizontal: 2, vertical: -1, viewportWidth: 800, viewportHeight: 600 }), true);
		assert.strictEqual(isSceneViewNavigation({ kind: 'pan', horizontal: 2, vertical: -1, viewportWidth: 0, viewportHeight: 600 }), false);
		assert.strictEqual(isSceneViewNavigation({ kind: 'zoom', amount: Number.NaN }), false);
		assert.strictEqual(isSceneViewNavigation({ kind: 'focusSelected' }), true);
		assert.strictEqual(isSceneViewNavigation({ kind: 'unknown' }), false);
	});

	test('validates complete finite renderer-authoritative camera state', () => {
		const cameraState = {
			paneId: 'pane-a',
			sessionId: 1,
			rendererGeneration: 2,
			position: [1, 2, 3],
			orientationDegrees: [-15, 45, 0],
			pivot: [0, 1, -2],
			projection: 'perspective'
		};

		assert.strictEqual(isViewportCameraState(cameraState), true);
		assert.strictEqual(isViewportCameraState({ ...cameraState, position: [1, 2] }), false);
		assert.strictEqual(isViewportCameraState({ ...cameraState, pivot: [0, Number.NaN, 0] }), false);
		assert.strictEqual(isViewportCameraState({ ...cameraState, orientationDegrees: [0, 0, Number.POSITIVE_INFINITY] }), false);
		assert.strictEqual(isViewportCameraState({ ...cameraState, projection: 'isometric' }), false);
		assert.strictEqual(isViewportCameraState({ ...cameraState, rendererGeneration: 0 }), false);
	});

	test('serializes Scene View navigation with the protocol 1.0 vocabulary', () => {
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'orbit', horizontal: 2, vertical: -3, viewportWidth: 800, viewportHeight: 600 }), 'SCENE_NAVIGATE ORBIT 2 -3 800 600');
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'pan', horizontal: -4, vertical: 5, viewportWidth: 900, viewportHeight: 700 }), 'SCENE_NAVIGATE PAN -4 5 900 700');
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'zoom', amount: 120 }), 'SCENE_NAVIGATE ZOOM 120');
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'gizmoClick', horizontal: 700, vertical: 80, viewportWidth: 800, viewportHeight: 600 }), 'SCENE_NAVIGATE GIZMO_CLICK 700 80 800 600');
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'focusSelected' }), 'SCENE_NAVIGATE FOCUS_SELECTED');
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'frameAll' }), 'SCENE_NAVIGATE FRAME_ALL');
		assert.strictEqual(sceneViewNavigationCommand({ kind: 'toggleProjection' }), 'SCENE_NAVIGATE TOGGLE_PROJECTION');
	});

	test('validates and serializes transform configuration and pointer commands', () => {
		const settings = { tool: 'move', space: 'local', snapping: true, translationSnap: 0.5, rotationSnap: 15, scaleSnap: 0.1 } as const;
		const pointer = { phase: 'begin', horizontal: 320, vertical: 240, viewportWidth: 800, viewportHeight: 600 } as const;

		assert.strictEqual(isSceneTransformSettings(settings), true);
		assert.strictEqual(sceneTransformConfigCommand(settings), 'SCENE_TRANSFORM_CONFIG MOVE LOCAL ON 0.5 15 0.1');
		assert.strictEqual(isSceneTransformSettings({ ...settings, translationSnap: 0 }), false);
		assert.strictEqual(isSceneTransformPointer(pointer), true);
		assert.strictEqual(sceneTransformPointerCommand(pointer, 8, 3), 'SCENE_TRANSFORM_POINTER BEGIN 320 240 800 600 8 3');
		assert.strictEqual(sceneTransformPointerCommand({ ...pointer, phase: 'update' }, undefined, 3), 'SCENE_TRANSFORM_POINTER UPDATE 320 240 800 600 NONE 3');
		assert.strictEqual(isSceneTransformPointer({ ...pointer, viewportWidth: 0 }), false);
	});

	test('rejects stale generations and duplicate frames', async () => {
		const frames: number[] = [];
		const router = new JScene3DViewportFrameRouter<number>();
		router.register('pane-a', { onFrame: async frame => { frames.push(frame); }, onFailure: () => undefined });
		router.bindSession('pane-a', { sessionId: 1, rendererGeneration: 2 });

		assert.strictEqual(await router.route(1, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, presentationGeneration: 0, surfaceGeneration: 1, frameNumber: 1 }), true);
		assert.strictEqual(await router.route(2, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, presentationGeneration: 0, surfaceGeneration: 2, frameNumber: 2 }), true);
		assert.strictEqual(await router.route(3, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, presentationGeneration: 0, surfaceGeneration: 1, frameNumber: 3 }), false);
		assert.strictEqual(await router.route(4, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, presentationGeneration: 0, surfaceGeneration: 2, frameNumber: 2 }), false);
		assert.strictEqual(await router.route(5, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, presentationGeneration: 1, surfaceGeneration: 2, frameNumber: 3 }), true);
		assert.strictEqual(await router.route(6, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, presentationGeneration: 0, surfaceGeneration: 3, frameNumber: 4 }), false);
		assert.deepStrictEqual(frames, [1, 2, 5]);
	});

	test('routes failures only to the owning pane and session', () => {
		const failures: string[] = [];
		const router = new JScene3DViewportFrameRouter<number>();
		router.register('pane-a', { onFrame: async () => undefined, onFailure: failure => failures.push(failure.message) });
		router.bindSession('pane-a', { sessionId: 1, rendererGeneration: 2 });

		assert.strictEqual(router.fail({ paneId: 'pane-a', session: { sessionId: 2, rendererGeneration: 2 }, message: 'wrong' }), false);
		assert.strictEqual(router.fail({ paneId: 'pane-b', message: 'wrong pane' }), false);
		assert.strictEqual(router.fail({ paneId: 'pane-a', session: { sessionId: 1, rendererGeneration: 2 }, message: 'renderer exited' }), true);
		assert.deepStrictEqual(failures, ['renderer exited']);
	});

	test('begins stopping every owned session before awaiting completion', async () => {
		const sessions = [{ stopping: false }, { stopping: false }];
		let completeStop: (() => void) | undefined;
		const stopCompleted = new Promise<void>(resolve => completeStop = resolve);

		const stopping = stopViewportSessions(sessions, async session => {
			session.stopping = true;
			await stopCompleted;
		});

		assert.deepStrictEqual(sessions.map(session => session.stopping), [true, true]);
		completeStop?.();
		await stopping;
	});
});
