/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
import { IJScene3DViewportCameraState, IJScene3DViewportFrameIdentity, IJScene3DViewportSessionIdentity } from '../../common/jscene3dViewport.js';
import { createJScene3DViewportBridge } from '../../electron-browser/jscene3dViewportPreload.js';

suite('JScene3DViewportPreload', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains initial camera state until start binds the exact session', async () => {
		const ipc = new TestIpcRenderer();
		const bridge = createJScene3DViewportBridge(
			ipc as unknown as Electron.IpcRenderer,
			{ setSharedTextureReceiver: () => undefined } as unknown as typeof Electron.sharedTexture
		);
		const states: IJScene3DViewportCameraState[] = [];
		bridge.registerPane(
			'pane-a',
			() => undefined,
			async () => undefined,
			() => undefined,
			() => undefined,
			() => undefined,
			state => states.push(state)
		);
		ipc.onStart = session => ipc.emit('vscode:jscene3dViewport:cameraState', cameraState(session));

		await bridge.start('pane-a', sceneLaunch(), 800, 600);

		assert.deepStrictEqual(states.map(state => state.position), [[1, 2, 3]]);
		ipc.emit('vscode:jscene3dViewport:cameraState', cameraState({ sessionId: 2, rendererGeneration: 1 }));
		ipc.emit('vscode:jscene3dViewport:cameraState', cameraState({ sessionId: 1, rendererGeneration: 2 }));
		assert.strictEqual(states.length, 1, 'rejects stale session and renderer generations');
	});

	test('releases rather than presents a transfer invalidated by pause and rapid resume', async () => {
		const ipc = new TestIpcRenderer();
		const textures = new TestSharedTextureReceiver();
		const bridge = createJScene3DViewportBridge(
			ipc as unknown as Electron.IpcRenderer,
			textures as unknown as typeof Electron.sharedTexture
		);
		const frames: number[] = [];
		bridge.registerPane(
			'pane-a',
			() => undefined,
			async frame => { frames.push((frame as unknown as { id: number }).id); },
			() => undefined,
			() => undefined,
			() => undefined,
			() => undefined
		);
		const session = await bridge.start('pane-a', sceneLaunch(), 800, 600);
		bridge.resume('pane-a', session);

		await textures.receive(1, frameIdentity(session, 0, 1));
		bridge.pause('pane-a', session);
		bridge.resume('pane-a', session);
		await textures.receive(2, frameIdentity(session, 0, 2));
		await textures.receive(3, frameIdentity(session, 1, 3));
		for (let cycle = 0; cycle < 10; cycle++) {
			bridge.pause('pane-a', session);
			bridge.resume('pane-a', session);
		}
		await textures.receive(4, frameIdentity(session, 1, 4));
		await textures.receive(5, frameIdentity(session, 11, 5));

		assert.deepStrictEqual(frames, [1, 3, 5]);
		assert.deepStrictEqual(textures.released, [1, 2, 3, 4, 5]);
		assert.deepStrictEqual(textures.closed, [1, 3, 5]);
	});

	test('rejects old resize generations and frames delivered after disposal', async () => {
		const ipc = new TestIpcRenderer();
		const textures = new TestSharedTextureReceiver();
		const bridge = createJScene3DViewportBridge(
			ipc as unknown as Electron.IpcRenderer,
			textures as unknown as typeof Electron.sharedTexture
		);
		const frames: number[] = [];
		bridge.registerPane(
			'pane-a',
			() => undefined,
			async frame => { frames.push((frame as unknown as { id: number }).id); },
			() => undefined,
			() => undefined,
			() => undefined,
			() => undefined
		);
		const session = await bridge.start('pane-a', sceneLaunch(), 800, 600);
		bridge.resume('pane-a', session);
		bridge.resize('pane-a', session, 1024, 768);

		await textures.receive(1, frameIdentity(session, 0, 1));
		await textures.receive(2, frameIdentity(session, 1, 2, 2));
		bridge.unregisterPane('pane-a');
		await textures.receive(3, frameIdentity(session, 1, 3, 2));

		assert.deepStrictEqual(frames, [2]);
		assert.deepStrictEqual(textures.released, [1, 2, 3]);
		assert.deepStrictEqual(textures.closed, [2]);
	});
});

class TestIpcRenderer {
	private readonly listeners = new Map<string, Array<(event: unknown, value: unknown) => void>>();
	onStart: ((session: IJScene3DViewportSessionIdentity) => void) | undefined;

	on(channel: string, listener: (event: unknown, value: unknown) => void): void {
		const listeners = this.listeners.get(channel) ?? [];
		listeners.push(listener);
		this.listeners.set(channel, listeners);
	}

	async invoke(channel: string): Promise<unknown> {
		if (channel === 'vscode:jscene3dViewport:start') {
			const session = { sessionId: 1, rendererGeneration: 1 };
			this.onStart?.(session);
			return session;
		}
		return undefined;
	}

	send(): void { }

	emit(channel: string, value: unknown): void {
		for (const listener of this.listeners.get(channel) ?? []) {
			listener(undefined, value);
		}
	}
}

class TestSharedTextureReceiver {
	readonly released: number[] = [];
	readonly closed: number[] = [];
	private receiver: ((data: Electron.ReceivedSharedTextureData, identity: unknown) => Promise<void>) | undefined;

	setSharedTextureReceiver(receiver: (data: Electron.ReceivedSharedTextureData, identity: unknown) => Promise<void>): void {
		this.receiver = receiver;
	}

	async receive(frame: number, identity: IJScene3DViewportFrameIdentity): Promise<void> {
		await this.receiver?.({
			importedSharedTexture: {
				textureId: `texture-${frame}`,
				getVideoFrame: () => ({ id: frame, close: () => this.closed.push(frame) }) as unknown as VideoFrame,
				release: () => this.released.push(frame),
				subtle: undefined as never
			}
		}, identity);
	}
}

function cameraState(session: IJScene3DViewportSessionIdentity): IJScene3DViewportCameraState {
	return {
		paneId: 'pane-a',
		...session,
		position: [1, 2, 3],
		orientationDegrees: [10, 20, 30],
		pivot: [0, 0, 0],
		projection: 'perspective'
	};
}

function frameIdentity(
	session: IJScene3DViewportSessionIdentity,
	presentationGeneration: number,
	frameNumber: number,
	surfaceGeneration = 1
): IJScene3DViewportFrameIdentity {
	return { paneId: 'pane-a', ...session, presentationGeneration, surfaceGeneration, frameNumber };
}

function sceneLaunch() {
	return {
		kind: 'scene' as const,
		viewportId: 'viewport-a',
		connectionGeneration: 'connection-a',
		projectGeneration: 1,
		projectId: 'example.project',
		projectName: 'Example',
		projectRoot: '/projects/example',
		publishedContentRoot: '/projects/example/.jscene3d/published',
		engineVersion: '0.1.0-SNAPSHOT',
		sceneAssetId: 'scene-a',
		sceneName: 'Main',
		snapshot: { sceneAssetId: 'scene-a', revision: 0, occurrences: [] }
	};
}
