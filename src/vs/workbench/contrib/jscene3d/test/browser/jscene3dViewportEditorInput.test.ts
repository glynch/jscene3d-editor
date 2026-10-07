/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { IJScene3DSceneViewOccurrence, IJScene3DViewportBridge, IJScene3DViewportFailure, IJScene3DViewportFrameIdentity, IJScene3DViewportSelection, IJScene3DViewportSessionIdentity, IJScene3DSceneViewSnapshot, IJScene3DViewportLaunch } from '../../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities, Verbosity } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CustomEditorInput } from '../../../customEditor/browser/customEditorInput.js';
import { JScene3DSceneEditorInput } from '../../browser/jscene3dSceneEditorInput.js';
import { JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE, JSCENE3D_SCENE_DEFINITION_VIEW_TYPE } from '../../browser/jscene3dSemanticEditor.js';
import { beginJScene3DViewportInput, IJScene3DViewportPresentation, jscene3dViewportStartupPresentation, JScene3DViewportEditorInput, JScene3DViewportStartupState } from '../../browser/jscene3dViewportEditorInput.js';
import { JScene3DViewportFrameGate, jscene3dViewportTextureCoordinates } from '../../browser/jscene3dViewportModel.js';

const launch = {
	kind: 'game' as const,
	viewportId: 'viewport-a',
	connectionGeneration: 'connection-a',
	projectGeneration: 7,
	projectId: 'example.project',
	projectName: 'Example Project',
	projectRoot: '/projects/example',
	publishedContentRoot: '/projects/example/.jscene3d/published',
	engineVersion: '0.1.0-SNAPSHOT',
	sceneAssetId: 'e890c4c3-fb32-49d8-88b8-4e04e7a29656',
	sceneName: 'Opening Scene',
	runtimeArtifacts: ['/runtime/example.jar']
};

suite('JScene3DViewportEditorInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('presents top-left-origin external textures without vertical inversion', () => {
		assert.deepStrictEqual(jscene3dViewportTextureCoordinates, [
			[0, 0], [1, 0], [0, 1],
			[0, 1], [1, 0], [1, 1]
		]);
	});

	test('maps every normal Scene startup stage to one stable loading presentation', () => {
		assert.strictEqual(jscene3dViewportStartupPresentation('scene', 'renderer-starting'), 'scene-loading');
		assert.strictEqual(jscene3dViewportStartupPresentation('scene', 'waiting-for-first-frame'), 'scene-loading');
		assert.strictEqual(jscene3dViewportStartupPresentation('scene', 'rendered'), 'hidden');
		assert.strictEqual(jscene3dViewportStartupPresentation('scene', 'failed'), 'failed');
		assert.strictEqual(jscene3dViewportStartupPresentation('scene', 'disposed'), 'hidden');
	});

	test('includes service, project, Scene, and viewport identity without becoming a singleton', () => {
		const first = new JScene3DViewportEditorInput(launch);
		const sameViewport = new JScene3DViewportEditorInput({ ...launch });
		const otherViewport = new JScene3DViewportEditorInput({ ...launch, viewportId: 'viewport-b' });
		const staleGeneration = new JScene3DViewportEditorInput({ ...launch, projectGeneration: 8 });
		try {
			assert.match(first.resource.toString(), /^jscene3d-viewport:\/\/connection-a\/7\//);
			assert.strictEqual(first.matches(sameViewport), true);
			assert.strictEqual(first.matches(otherViewport), false);
			assert.strictEqual(first.matches(staleGeneration), false);
			assert.strictEqual(first.getName(), 'Example Project — Opening Scene');
			assert.strictEqual(first.hasCapability(EditorInputCapabilities.Singleton), false);
			assert.strictEqual(first.hasCapability(EditorInputCapabilities.Readonly), true);
		} finally {
			first.dispose();
			sameViewport.dispose();
			otherViewport.dispose();
			staleGeneration.dispose();
		}
	});

	test('does not shadow the exact authored input while it is being replaced', () => {
		const authored = fakeCustomEditorInput('/projects/example/opening.scene.json');
		const equivalent = fakeCustomEditorInput('/projects/example/opening.scene.json');
		const viewport = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const scene = new JScene3DSceneEditorInput(authored, viewport, {} as IEditorService);
		try {
			assert.strictEqual(scene.matches(authored), false);
			assert.strictEqual(scene.matches(equivalent), true);
		} finally {
			Object.setPrototypeOf(authored, TestEditorInput.prototype);
			Object.setPrototypeOf(equivalent, TestEditorInput.prototype);
			scene.dispose();
			equivalent.dispose();
		}
	});

	test('presents semantic definition names, icons, source tooltips, and breadcrumb policy', () => {
		const authored = fakeCustomEditorInput(
			'/projects/example/main.scene.json',
			'Main',
			JSCENE3D_SCENE_DEFINITION_VIEW_TYPE
		);
		const entity = fakeCustomEditorInput(
			'/projects/example/crate.entity.json',
			'Crate',
			JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE
		);
		const viewport = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const scene = new JScene3DSceneEditorInput(authored, viewport, {} as IEditorService);
		try {
			assert.strictEqual(scene.getName(), 'Main');
			assert.strictEqual(scene.getTitle(Verbosity.LONG), '/projects/example/main.scene.json');
			assert.strictEqual(scene.getIcon(), Codicon.symbolNamespace);
			assert.strictEqual(scene.hasCapability(EditorInputCapabilities.HideBreadcrumbs), true);
			assert.strictEqual(entity.getName(), 'Crate');
			assert.strictEqual(entity.getTitle(Verbosity.LONG), '/projects/example/crate.entity.json');
			assert.strictEqual(entity.getIcon(), Codicon.symbolClass);
			assert.strictEqual(entity.hasCapability(EditorInputCapabilities.HideBreadcrumbs), true);
		} finally {
			Object.setPrototypeOf(authored, TestEditorInput.prototype);
			Object.setPrototypeOf(entity, TestEditorInput.prototype);
			scene.dispose();
			entity.dispose();
		}
	});

	test('accepts only newer snapshots for the exact safe Scene View identity', () => {
		const { runtimeArtifacts: _runtimeArtifacts, ...baseLaunch } = launch;
		const input = new JScene3DViewportEditorInput({
			...baseLaunch,
			kind: 'scene',
			snapshot: { sceneAssetId: launch.sceneAssetId, revision: 2, occurrences: [] }
		});
		const revisions: number[] = [];
		const listener = input.onDidChangeSceneViewSnapshot(snapshot => revisions.push(snapshot.revision));
		try {
			assert.strictEqual(input.updateSceneViewSnapshot({ sceneAssetId: launch.sceneAssetId, revision: 1, occurrences: [] }), false);
			assert.strictEqual(input.updateSceneViewSnapshot({ sceneAssetId: 'another-scene', revision: 3, occurrences: [] }), false);
			assert.strictEqual(input.updateSceneViewSnapshot({ sceneAssetId: launch.sceneAssetId, revision: 3, occurrences: [] }), true);
			assert.deepStrictEqual(revisions, [3]);
		} finally {
			listener.dispose();
			input.dispose();
		}
	});

	test('retains each renderer session while switching between open Scene editors', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const main = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const second = new JScene3DViewportEditorInput(sceneLaunch('second', 'viewport-second'));
		try {
			await main.attach(presentation, { width: 800, height: 600 }, bridge);
			bridge.rendererReady('viewport-main');
			await bridge.presentFrame('viewport-main');
			main.detach(presentation);
			await second.attach(presentation, { width: 800, height: 600 }, bridge);
			bridge.rendererReady('viewport-second', { sessionId: 2, rendererGeneration: 1 });
			await bridge.presentFrame('viewport-second', { sessionId: 2, rendererGeneration: 1 });
			second.detach(presentation);
			beginJScene3DViewportInput(presentation, main.startupState, main.launch.kind);
			await main.attach(presentation, { width: 800, height: 600 }, bridge);

			assert.deepStrictEqual({
				started: bridge.started.map(entry => entry.launch.viewportId),
				stopped: bridge.stopped,
				paused: bridge.paused.length,
				resumed: bridge.resumed.length,
				activeState: presentation.states.at(-1),
				loadingVisible: presentation.loadingStateVisible
			}, {
				started: ['viewport-main', 'viewport-second'],
				stopped: [],
				paused: 2,
				resumed: 3,
				activeState: 'rendered',
				loadingVisible: false
			});
		} finally {
			await main.stop();
			await second.stop();
			main.dispose();
			second.dispose();
		}
	});

	test('replaces the previous Scene frame with the newly active Scene loading state', () => {
		const presentation = new TestPresentation();
		presentation.hasVisibleFrame = true;

		beginJScene3DViewportInput(presentation, 'renderer-starting', 'scene');

		assert.deepStrictEqual({ hasVisibleFrame: presentation.hasVisibleFrame, state: presentation.states.at(-1) }, {
			hasVisibleFrame: false,
			state: 'renderer-starting'
		});
		assert.strictEqual(presentation.visiblePresentation, 'Loading Scene…');
	});

	test('keeps an earlier submitted Scene frame hidden after a newer input becomes active', () => {
		const frameGate = new JScene3DViewportFrameGate();
		const canvas = { style: { visibility: 'visible' } };
		const mainFrameGeneration = frameGate.capture();

		frameGate.hide(canvas);
		assert.strictEqual(frameGate.reveal(canvas, mainFrameGeneration), false);
		assert.strictEqual(canvas.style.visibility, 'hidden');

		const secondFrameGeneration = frameGate.capture();
		assert.strictEqual(frameGate.reveal(canvas, secondFrameGeneration), true);
		assert.strictEqual(canvas.style.visibility, 'visible');
	});

	test('starts and resizes independent Scene sessions with their current physical dimensions', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const main = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const second = new JScene3DViewportEditorInput(sceneLaunch('second', 'viewport-second'));
		try {
			await main.attach(presentation, { width: 1280, height: 720 }, bridge);
			main.resize(presentation, { width: 1600, height: 900 });
			main.detach(presentation);
			await second.attach(presentation, { width: 1500, height: 1000 }, bridge);
			second.resize(presentation, { width: 1200, height: 800 });
			second.detach(presentation);
			await main.attach(presentation, { width: 1920, height: 1080 }, bridge);

			assert.deepStrictEqual({
				started: bridge.started.map(({ launch, width, height }) => ({ viewportId: launch.viewportId, width, height })),
				resized: bridge.resized.map(({ viewportId, width, height }) => ({ viewportId, width, height }))
			}, {
				started: [
					{ viewportId: 'viewport-main', width: 1280, height: 720 },
					{ viewportId: 'viewport-second', width: 1500, height: 1000 }
				],
				resized: [
					{ viewportId: 'viewport-main', width: 1280, height: 720 },
					{ viewportId: 'viewport-main', width: 1600, height: 900 },
					{ viewportId: 'viewport-second', width: 1500, height: 1000 },
					{ viewportId: 'viewport-second', width: 1200, height: 800 },
					{ viewportId: 'viewport-main', width: 1920, height: 1080 }
				]
			});
		} finally {
			await main.stop();
			await second.stop();
			main.dispose();
			second.dispose();
		}
	});

	test('updates a retained Scene session without launching another renderer', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const input = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		try {
			await input.attach(presentation, { width: 800, height: 600 }, bridge);
			assert.strictEqual(input.updateSceneViewSnapshot({ sceneAssetId: 'main', revision: 1, occurrences: [] }), true);

			assert.deepStrictEqual({ starts: bridge.started.length, updates: bridge.updated }, {
				starts: 1,
				updates: [{ viewportId: 'viewport-main', revision: 1 }]
			});
		} finally {
			await input.stop();
			input.dispose();
		}
	});

	test('retains Hierarchy selection until the first native Scene session is bound', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const input = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const occurrence = { rootDefinitionAssetId: 'main', entityPath: ['environment', 'crate'] };
		try {
			assert.strictEqual(input.updateSceneViewSelection(0, occurrence), true);
			await input.attach(presentation, { width: 800, height: 600 }, bridge);

			assert.deepStrictEqual(bridge.selected, [{ viewportId: 'viewport-main', revision: 0, occurrence }]);
		} finally {
			await input.stop();
			input.dispose();
		}
	});

	test('reports only exact-session native picks to the shared Scene selection', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const input = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const selections: Array<IJScene3DSceneViewOccurrence | null> = [];
		const listener = input.onDidChangeSceneSelection(selection => selections.push(selection.occurrence));
		try {
			await input.attach(presentation, { width: 800, height: 600 }, bridge);
			bridge.sceneSelection({ revision: 1, occurrence: null });
			bridge.sceneSelection({ occurrence: { rootDefinitionAssetId: 'main', entityPath: ['crate'] } });

			assert.deepStrictEqual(selections, [{ rootDefinitionAssetId: 'main', entityPath: ['crate'] }]);
		} finally {
			listener.dispose();
			await input.stop();
			input.dispose();
		}
	});

	test('keeps loading visible until the first native frame is presented', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const input = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		try {
			await input.attach(presentation, { width: 800, height: 600 }, bridge);

			assert.deepStrictEqual({ states: presentation.states, loadingStateVisible: presentation.loadingStateVisible }, {
				states: ['renderer-starting'],
				loadingStateVisible: true
			});
			bridge.rendererReady();
			assert.deepStrictEqual(presentation.states, ['renderer-starting', 'waiting-for-first-frame']);
			assert.deepStrictEqual(presentation.visiblePresentations, ['Loading Scene…', 'Loading Scene…']);

			await bridge.presentFrame();
			assert.deepStrictEqual({
				states: presentation.states,
				framesPresented: presentation.framesPresented,
				visiblePresentation: presentation.visiblePresentation,
				loadingStateVisible: presentation.loadingStateVisible
			}, {
				states: [
					'renderer-starting',
					'waiting-for-first-frame',
					'rendered'
				],
				framesPresented: 1,
				visiblePresentation: 'hidden',
				loadingStateVisible: false
			});
		} finally {
			await input.stop();
			input.dispose();
		}
	});

	test('does not let an obsolete first frame dismiss the newly active Scene loader', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new DeferredFramePresentation();
		const main = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const second = new JScene3DViewportEditorInput(sceneLaunch('second', 'viewport-second'));
		try {
			await main.attach(presentation, { width: 800, height: 600 }, bridge);
			bridge.rendererReady('viewport-main');
			const staleFrame = bridge.presentFrame('viewport-main');

			main.detach(presentation);
			beginJScene3DViewportInput(presentation, second.startupState, second.launch.kind);
			await second.attach(presentation, { width: 800, height: 600 }, bridge);
			presentation.resolveFrame(false);
			await staleFrame;

			assert.strictEqual(main.startupState, 'waiting-for-first-frame');
			assert.strictEqual(second.startupState, 'renderer-starting');
			assert.strictEqual(presentation.visiblePresentation, 'Loading Scene…');
			assert.strictEqual(presentation.loadingStateVisible, true);
		} finally {
			presentation.resolveFrame(false);
			await main.stop();
			await second.stop();
			main.dispose();
			second.dispose();
		}
	});

	test('rejects stale renderer-ready and first-frame identities', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const input = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		try {
			await input.attach(presentation, { width: 800, height: 600 }, bridge);
			bridge.rendererReady(undefined, { sessionId: 1, rendererGeneration: 2 });
			await bridge.presentFrame(undefined, { sessionId: 1, rendererGeneration: 2 });
			assert.deepStrictEqual(presentation.states, ['renderer-starting']);

			bridge.rendererReady();
			await bridge.presentFrame();
			assert.strictEqual(presentation.states.at(-1), 'rendered');
		} finally {
			await input.stop();
			input.dispose();
		}
	});

	test('retains renderer-ready when it arrives before the start reply binds its session', async () => {
		const bridge = new TestViewportBridge(true);
		const presentation = new TestPresentation();
		const input = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		try {
			const attaching = input.attach(presentation, { width: 800, height: 600 }, bridge);
			bridge.rendererReady();
			bridge.resolveStart();
			await attaching;

			assert.deepStrictEqual(presentation.states, [
				'renderer-starting',
				'waiting-for-first-frame'
			]);
		} finally {
			await input.stop();
			input.dispose();
		}
	});

	test('shows renderer failure and safely disposes while a launch is pending', async () => {
		const failedBridge = new TestViewportBridge();
		const failedPresentation = new TestPresentation();
		const failedInput = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		await failedInput.attach(failedPresentation, { width: 800, height: 600 }, failedBridge);
		failedBridge.fail('renderer failed before its first frame');
		assert.strictEqual(failedPresentation.states.at(-1), 'failed');
		assert.deepStrictEqual(failedPresentation.failures, ['renderer failed before its first frame']);
		await failedInput.stop(true);
		failedInput.dispose();

		const pendingBridge = new TestViewportBridge(true);
		const pendingPresentation = new TestPresentation();
		const pendingInput = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-pending'));
		const attaching = pendingInput.attach(pendingPresentation, { width: 800, height: 600 }, pendingBridge);
		pendingInput.dispose();
		pendingBridge.resolveStart();
		await attaching;
		assert.strictEqual(pendingPresentation.states.at(-1), 'disposed');
		assert.strictEqual(pendingBridge.registeredPaneCount, 0);
	});

	test('closing one Scene stops only its session and reopening starts a fresh session', async () => {
		const bridge = new TestViewportBridge();
		const presentation = new TestPresentation();
		const main = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main'));
		const second = new JScene3DViewportEditorInput(sceneLaunch('second', 'viewport-second'));
		const reopened = new JScene3DViewportEditorInput(sceneLaunch('main', 'viewport-main-reopened'));
		try {
			await main.attach(presentation, { width: 800, height: 600 }, bridge);
			main.detach(presentation);
			await second.attach(presentation, { width: 800, height: 600 }, bridge);
			second.detach(presentation);

			await main.stop();
			await second.attach(presentation, { width: 800, height: 600 }, bridge);
			assert.deepStrictEqual({
				starts: bridge.started.map(entry => entry.launch.viewportId),
				stops: bridge.stopped
			}, {
				starts: ['viewport-main', 'viewport-second'],
				stops: [bridge.started[0].paneId]
			});

			second.detach(presentation);
			await reopened.attach(presentation, { width: 800, height: 600 }, bridge);
			assert.deepStrictEqual(bridge.started.map(entry => entry.launch.viewportId), [
				'viewport-main',
				'viewport-second',
				'viewport-main-reopened'
			]);
		} finally {
			await main.stop();
			await second.stop();
			await reopened.stop();
			main.dispose();
			second.dispose();
			reopened.dispose();
		}
	});
});

class TestViewportBridge implements IJScene3DViewportBridge {
	readonly started: Array<{ paneId: string; launch: IJScene3DViewportLaunch; width: number; height: number }> = [];
	readonly stopped: string[] = [];
	readonly paused: string[] = [];
	readonly resumed: string[] = [];
	readonly resized: Array<{ viewportId: string; width: number; height: number }> = [];
	readonly updated: Array<{ viewportId: string; revision: number }> = [];
	readonly selected: Array<{ viewportId: string; revision: number; occurrence: IJScene3DSceneViewOccurrence | null }> = [];
	readonly picked: Array<{ viewportId: string; revision: number; horizontal: number; vertical: number }> = [];
	private readonly consumers = new Map<string, {
		onReady(session: IJScene3DViewportSessionIdentity): void;
		onFrame(frame: VideoFrame, identity: IJScene3DViewportFrameIdentity): Promise<void>;
		onFailure(failure: IJScene3DViewportFailure): void;
		onSelection(selection: IJScene3DViewportSelection): void;
	}>();
	private startResolver: ((session: IJScene3DViewportSessionIdentity) => void) | undefined;

	constructor(private readonly deferredStart = false) { }

	get registeredPaneCount(): number { return this.consumers.size; }

	registerPane(
		paneId: string,
		onReady: (session: IJScene3DViewportSessionIdentity) => void,
		_onFrame: (frame: VideoFrame, identity: IJScene3DViewportFrameIdentity) => Promise<void>,
		onFailure: (failure: IJScene3DViewportFailure) => void,
		onSelection: (selection: IJScene3DViewportSelection) => void
	): void {
		this.consumers.set(paneId, { onReady, onFrame: _onFrame, onFailure, onSelection });
	}

	unregisterPane(paneId: string): void {
		this.consumers.delete(paneId);
	}

	start(paneId: string, launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DViewportSessionIdentity> {
		this.started.push({ paneId, launch, width, height });
		const session = { sessionId: this.started.length, rendererGeneration: 1 };
		return this.deferredStart
			? new Promise(resolve => { this.startResolver = resolve; })
			: Promise.resolve(session);
	}

	updateSceneView(_paneId: string, _session: IJScene3DViewportSessionIdentity, snapshot: IJScene3DSceneViewSnapshot): void {
		const launch = this.started.find(entry => entry.launch.sceneAssetId === snapshot.sceneAssetId)?.launch;
		if (launch) {
			this.updated.push({ viewportId: launch.viewportId, revision: snapshot.revision });
		}
	}

	selectSceneView(paneId: string, _session: IJScene3DViewportSessionIdentity, revision: number, occurrence: IJScene3DSceneViewOccurrence | null): void {
		const viewportId = this.started.find(entry => entry.paneId === paneId)?.launch.viewportId;
		if (viewportId) {
			this.selected.push({ viewportId, revision, occurrence });
		}
	}

	pickSceneView(paneId: string, _session: IJScene3DViewportSessionIdentity, revision: number, horizontal: number, vertical: number): void {
		const viewportId = this.started.find(entry => entry.paneId === paneId)?.launch.viewportId;
		if (viewportId) {
			this.picked.push({ viewportId, revision, horizontal, vertical });
		}
	}

	resize(paneId: string, _session: IJScene3DViewportSessionIdentity, width: number, height: number): void {
		const viewportId = this.started.find(entry => entry.paneId === paneId)?.launch.viewportId;
		if (viewportId) {
			this.resized.push({ viewportId, width, height });
		}
	}
	pause(paneId: string): void { this.paused.push(paneId); }
	resume(paneId: string): void { this.resumed.push(paneId); }
	stop(paneId: string): Promise<void> {
		this.stopped.push(paneId);
		return Promise.resolve();
	}

	resolveStart(): void {
		this.startResolver?.({ sessionId: this.started.length, rendererGeneration: 1 });
		this.startResolver = undefined;
	}

	rendererReady(viewportId?: string, identity: IJScene3DViewportSessionIdentity = { sessionId: 1, rendererGeneration: 1 }): void {
		const started = viewportId ? this.started.find(entry => entry.launch.viewportId === viewportId)! : this.started[0];
		this.consumers.get(started.paneId)?.onReady(identity);
	}

	presentFrame(viewportId?: string, identity: IJScene3DViewportSessionIdentity = { sessionId: 1, rendererGeneration: 1 }): Promise<void> {
		const started = viewportId ? this.started.find(entry => entry.launch.viewportId === viewportId)! : this.started[0];
		return this.consumers.get(started.paneId)?.onFrame({} as VideoFrame, {
			paneId: started.paneId,
			...identity,
			surfaceGeneration: 1,
			frameNumber: 1
		}) ?? Promise.resolve();
	}

	fail(message: string): void {
		const started = this.started[0];
		this.consumers.get(started.paneId)?.onFailure({
			paneId: started.paneId,
			session: { sessionId: 1, rendererGeneration: 1 },
			message
		});
	}

	sceneSelection(overrides: Partial<IJScene3DViewportSelection>): void {
		const started = this.started[0];
		this.consumers.get(started.paneId)?.onSelection({
			paneId: started.paneId,
			sessionId: 1,
			rendererGeneration: 1,
			revision: 0,
			occurrence: null,
			...overrides
		});
	}
}

class TestPresentation implements IJScene3DViewportPresentation {
	readonly states: string[] = [];
	readonly visiblePresentations: string[] = [];
	readonly failures: string[] = [];
	framesPresented = 0;
	resetFrames = 0;
	hasVisibleFrame = false;
	loadingStateVisible = false;
	visiblePresentation = 'hidden';
	resetFrame(): void {
		this.resetFrames++;
		this.hasVisibleFrame = false;
	}
	showStartupState(state: JScene3DViewportStartupState, viewportKind: 'scene' | 'game'): void {
		this.states.push(state);
		const presentation = jscene3dViewportStartupPresentation(viewportKind, state);
		this.visiblePresentation = presentation === 'scene-loading' ? 'Loading Scene…' : presentation;
		this.visiblePresentations.push(this.visiblePresentation);
		this.loadingStateVisible = presentation === 'scene-loading'
			|| presentation === 'renderer-starting'
			|| presentation === 'waiting-for-first-frame';
	}
	presentFrame(_frame: VideoFrame, _identity: IJScene3DViewportFrameIdentity): Promise<boolean> {
		this.framesPresented++;
		this.hasVisibleFrame = true;
		return Promise.resolve(true);
	}
	showFailure(message: string): void {
		this.failures.push(message);
		this.loadingStateVisible = false;
		this.visiblePresentation = 'failed';
	}
	hideFailure(): void {
		this.loadingStateVisible = false;
		this.visiblePresentation = 'hidden';
	}
}

class DeferredFramePresentation extends TestPresentation {
	private frameResolver: ((presented: boolean) => void) | undefined;

	override presentFrame(_frame: VideoFrame, _identity: IJScene3DViewportFrameIdentity): Promise<boolean> {
		this.framesPresented++;
		return new Promise(resolve => { this.frameResolver = resolve; });
	}

	resolveFrame(presented: boolean): void {
		this.frameResolver?.(presented);
		this.frameResolver = undefined;
	}
}

function sceneLaunch(sceneAssetId: string, viewportId: string): IJScene3DViewportLaunch {
	const { runtimeArtifacts: _runtimeArtifacts, ...base } = launch;
	return {
		...base,
		kind: 'scene',
		viewportId,
		sceneAssetId,
		sceneName: sceneAssetId,
		snapshot: { sceneAssetId, revision: 0, occurrences: [] }
	};
}

class TestEditorInput extends EditorInput {
	constructor(override readonly resource: URI) { super(); }
	override get typeId(): string { return 'test.jscene3d.authored'; }
	override getName(): string { return 'Authored Scene'; }
}

function fakeCustomEditorInput(
	path: string,
	label = 'Main',
	viewType = JSCENE3D_SCENE_DEFINITION_VIEW_TYPE
): CustomEditorInput {
	const input = new TestEditorInput(URI.file(path));
	Object.assign(input, {
		_editorResource: URI.file(path),
		_webviewTitle: label,
		viewType,
		labelService: {
			getUriLabel: (resource: URI, options?: { noPrefix?: boolean }) => {
				assert.strictEqual(options?.noPrefix, true);
				return resource.fsPath;
			}
		},
		customEditorService: { getCustomEditorCapabilities: () => ({ supportsMultipleEditorsPerDocument: true }) },
		filesConfigurationService: { isReadonly: () => false }
	});
	Object.setPrototypeOf(input, CustomEditorInput.prototype);
	return input as unknown as CustomEditorInput;
}
