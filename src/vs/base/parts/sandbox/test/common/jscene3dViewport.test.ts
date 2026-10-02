/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { JScene3DViewportFrameRouter, isViewportFrameIdentity, isViewportLaunch, stopViewportSessions } from '../../common/jscene3dViewport.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';

suite('JScene3DViewportFrameRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('accepts only complete Java-prepared project launches', () => {
		const launch = {
			viewportId: 'viewport-a',
			connectionGeneration: 'connection-a',
			projectGeneration: 7,
			projectId: 'example.project',
			projectName: 'Example',
			projectRoot: '/projects/example',
			publishedContentRoot: '/projects/example/target/import-cache',
			engineVersion: '0.1.0-SNAPSHOT',
			worldAssetId: '2f26576c-570d-4338-bc30-52bc41def3a5',
			worldName: 'Opening World',
			runtimeArtifacts: ['/runtime/application.jar']
		};

		assert.strictEqual(isViewportLaunch(launch), true);
		assert.strictEqual(isViewportLaunch({ ...launch, projectGeneration: 0 }), false);
		assert.strictEqual(isViewportLaunch({ ...launch, runtimeArtifacts: ['/runtime/application.jar', ''] }), false);
	});

	test('rejects malformed identities and frames from another session', async () => {
		const frames: number[] = [];
		const router = new JScene3DViewportFrameRouter<number>();
		assert.strictEqual(router.register('pane-a', { onFrame: async frame => { frames.push(frame); }, onFailure: () => undefined }), true);
		assert.strictEqual(router.bindSession('pane-a', { sessionId: 1, rendererGeneration: 2 }), true);

		assert.strictEqual(isViewportFrameIdentity({ paneId: 'pane-a' }), false);
		assert.strictEqual(await router.route(1, { paneId: 'pane-a' }), false);
		assert.strictEqual(await router.route(2, { paneId: 'pane-a', sessionId: 9, rendererGeneration: 2, surfaceGeneration: 1, frameNumber: 1 }), false);
		assert.deepStrictEqual(frames, []);
	});

	test('rejects stale generations and duplicate frames', async () => {
		const frames: number[] = [];
		const router = new JScene3DViewportFrameRouter<number>();
		router.register('pane-a', { onFrame: async frame => { frames.push(frame); }, onFailure: () => undefined });
		router.bindSession('pane-a', { sessionId: 1, rendererGeneration: 2 });

		assert.strictEqual(await router.route(1, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, surfaceGeneration: 1, frameNumber: 1 }), true);
		assert.strictEqual(await router.route(2, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, surfaceGeneration: 2, frameNumber: 2 }), true);
		assert.strictEqual(await router.route(3, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, surfaceGeneration: 1, frameNumber: 3 }), false);
		assert.strictEqual(await router.route(4, { paneId: 'pane-a', sessionId: 1, rendererGeneration: 2, surfaceGeneration: 2, frameNumber: 2 }), false);
		assert.deepStrictEqual(frames, [1, 2]);
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
