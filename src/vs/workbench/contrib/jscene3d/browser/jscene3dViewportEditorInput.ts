/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IJScene3DViewportBridge, IJScene3DViewportFailure, IJScene3DViewportFrameIdentity, IJScene3DViewportSessionIdentity, IJScene3DSceneViewSnapshot, IJScene3DViewportLaunch, isSceneViewSnapshot } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IJScene3DViewportSize, JScene3DViewportLifecycleAction, JScene3DViewportModel, JScene3DViewportStopGate } from './jscene3dViewportModel.js';

/** Visible renderer target attached to a retained viewport session. */
export interface IJScene3DViewportPresentation {
	resetFrame(): void;
	showStartupState(state: JScene3DViewportStartupState, viewportKind: IJScene3DViewportLaunch['kind']): void;
	presentFrame(frame: VideoFrame, identity: IJScene3DViewportFrameIdentity): Promise<boolean>;
	showFailure(message: string): void;
	hideFailure(): void;
}

/** User-visible startup state for one native viewport. */
export type JScene3DViewportStartupState = 'renderer-starting' | 'waiting-for-first-frame' | 'rendered' | 'failed' | 'disposed';

/** User-facing overlay derived from the detailed native viewport lifecycle. */
export type JScene3DViewportStartupPresentation =
	| 'scene-loading'
	| 'renderer-starting'
	| 'waiting-for-first-frame'
	| 'hidden'
	| 'failed';

/** Consolidates normal Scene startup stages without weakening their internal lifecycle states. */
export function jscene3dViewportStartupPresentation(
	viewportKind: IJScene3DViewportLaunch['kind'],
	state: JScene3DViewportStartupState
): JScene3DViewportStartupPresentation {
	if (state === 'failed') {
		return 'failed';
	}
	if (state === 'rendered' || state === 'disposed') {
		return 'hidden';
	}
	if (viewportKind === 'scene') {
		return 'scene-loading';
	}
	return state;
}

/** Clears presentation state before a different viewport input becomes active. */
export function beginJScene3DViewportInput(
	presentation: IJScene3DViewportPresentation,
	state: JScene3DViewportStartupState,
	viewportKind: IJScene3DViewportLaunch['kind']
): void {
	presentation.resetFrame();
	presentation.hideFailure();
	presentation.showStartupState(state, viewportKind);
}

/** One generation-scoped native viewport for a Java-prepared project Scene. */
export class JScene3DViewportEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.jscene3dRendererPreview';

	private readonly paneId = generateUuid();
	private _launch: IJScene3DViewportLaunch;
	private bridge: IJScene3DViewportBridge | undefined;
	private readonly model = new JScene3DViewportModel();
	private readonly stopGate = new JScene3DViewportStopGate();
	private presentation: IJScene3DViewportPresentation | undefined;
	private registered = false;
	private startToken = 0;
	private failure: string | undefined;
	private pendingReady: IJScene3DViewportSessionIdentity | undefined;
	private _startupState: JScene3DViewportStartupState = 'renderer-starting';
	private readonly startupStateEmitter = this._register(new Emitter<JScene3DViewportStartupState>());
	private readonly sceneViewSnapshotEmitter = this._register(new Emitter<IJScene3DSceneViewSnapshot>());
	readonly onDidChangeStartupState: Event<JScene3DViewportStartupState> = this.startupStateEmitter.event;
	readonly onDidChangeSceneViewSnapshot: Event<IJScene3DSceneViewSnapshot> = this.sceneViewSnapshotEmitter.event;

	constructor(launch: IJScene3DViewportLaunch) {
		super();
		this._launch = launch;
	}
	get resource(): URI {
		return URI.from({
			scheme: 'jscene3d-viewport',
			authority: encodeURIComponent(this.launch.connectionGeneration),
			path: `/${this.launch.projectGeneration}/${encodeURIComponent(this.launch.sceneAssetId)}/${this.launch.viewportId}`
		});
	}
	get launch(): IJScene3DViewportLaunch { return this._launch; }
	get startupState(): JScene3DViewportStartupState { return this._startupState; }

	override get typeId(): string { return JScene3DViewportEditorInput.ID; }
	override get editorId(): string { return JScene3DViewportEditorInput.ID; }
	override getName(): string {
		return localize('jscene3dProjectViewportName', "{0} — {1}", this.launch.projectName, this.launch.sceneName);
	}
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }
	updateSceneViewSnapshot(snapshot: IJScene3DSceneViewSnapshot): boolean {
		if (this.launch.kind !== 'scene' || !isSceneViewSnapshot(snapshot)
			|| snapshot.sceneAssetId !== this.launch.sceneAssetId
			|| snapshot.revision <= this.launch.snapshot.revision) {
			return false;
		}
		this._launch = { ...this.launch, snapshot };
		this.sceneViewSnapshotEmitter.fire(snapshot);
		const session = this.model.sessionIdentity;
		if (session) {
			this.bridge?.updateSceneView(this.paneId, session, snapshot);
		}
		return true;
	}

	/** Rebinds a restored authored tab before its retained native session starts. */
	prepareLaunch(launch: IJScene3DViewportLaunch): boolean {
		if (this.registered || this.model.sessionIdentity
			|| launch.kind !== 'scene' || this.launch.kind !== 'scene'
			|| launch.sceneAssetId !== this.launch.sceneAssetId) {
			return false;
		}
		this._launch = launch;
		this._onDidChangeLabel.fire();
		return true;
	}

	/** Attaches the currently visible editor pane without recreating an existing renderer session. */
	async attach(
		presentation: IJScene3DViewportPresentation,
		size: IJScene3DViewportSize,
		bridge: IJScene3DViewportBridge
	): Promise<void> {
		this.presentation = presentation;
		presentation.hideFailure();
		presentation.showStartupState(this.startupState, this.launch.kind);
		this.bridge ??= bridge;
		if (this.bridge !== bridge) {
			throw new Error('A viewport session cannot move between renderer bridges');
		}
		if (this.failure !== undefined) {
			presentation.showFailure(this.failure);
			return;
		}
		if (this.stopGate.current) {
			await this.stopGate.current;
		}
		if (this.isDisposed()) {
			return;
		}
		if (this.model.sessionIdentity) {
			this.applyLifecycleAction(this.model.setVisible(true));
			this.resize(presentation, size);
			return;
		}
		const token = ++this.startToken;
		try {
			if (!this.registered) {
				bridge.registerPane(
					this.paneId,
					identity => this.onRendererReady(identity),
					(frame, identity) => this.onFrame(frame, identity),
					failure => this.onFailure(failure)
				);
				this.registered = true;
			}
			this.model.setVisible(true);
			const session = await bridge.start(this.paneId, this.launch, size.width, size.height);
			if (this.isDisposed() || token !== this.startToken) {
				await this.stop();
				return;
			}
			this.applyLifecycleAction(this.model.bindSession(session));
			const pendingReady = this.pendingReady;
			this.pendingReady = undefined;
			if (pendingReady) {
				this.onRendererReady(pendingReady);
			}
			this.resize(presentation, size);
		} catch (error) {
			this.failure = error instanceof Error ? error.message : String(error);
			this.transitionTo('failed');
			if (this.presentation === presentation) {
				presentation.showFailure(this.failure);
			}
			this.model.fail();
			await this.stop(true);
		}
	}

	/** Detaches an inactive pane and pauses, but retains, the renderer session. */
	detach(presentation: IJScene3DViewportPresentation): void {
		if (this.presentation !== presentation) {
			return;
		}
		this.presentation = undefined;
		this.applyLifecycleAction(this.model.setVisible(false));
	}

	setVisible(presentation: IJScene3DViewportPresentation, visible: boolean): void {
		if (this.presentation === presentation) {
			this.applyLifecycleAction(this.model.setVisible(visible));
		}
	}

	resize(presentation: IJScene3DViewportPresentation, size: IJScene3DViewportSize): void {
		const session = this.model.sessionIdentity;
		if (this.presentation === presentation && session && this.model.requestResize(size)) {
			this.bridge?.resize(this.paneId, session, size.width, size.height);
		}
	}

	/** Stops and releases the native renderer session owned by this editor input. */
	stop(preserveFailure = false): Promise<void> {
		return this.stopGate.run(async () => {
			this.startToken++;
			const session = this.model.sessionIdentity;
			this.model.dispose();
			this.pendingReady = undefined;
			if (!preserveFailure) {
				this.transitionTo('disposed');
			}
			try {
				if (this.registered) {
					await this.bridge?.stop(this.paneId, session);
				}
			} finally {
				if (this.registered) {
					this.bridge?.unregisterPane(this.paneId);
				}
				this.registered = false;
				this.presentation = undefined;
				if (!preserveFailure) {
					this.failure = undefined;
				}
			}
		});
	}

	override dispose(): void {
		if (this.isDisposed()) {
			return;
		}
		void this.stop();
		super.dispose();
	}

	private applyLifecycleAction(action: JScene3DViewportLifecycleAction | undefined): void {
		const session = this.model.sessionIdentity;
		if (!session || !action) {
			return;
		}
		switch (action) {
			case 'pause':
				this.bridge?.pause(this.paneId, session);
				break;
			case 'resume':
				this.bridge?.resume(this.paneId, session);
				break;
			case 'stop':
				void this.stop(true);
				break;
		}
	}

	private onFailure(failure: IJScene3DViewportFailure): void {
		if (this.model.isTerminal) {
			return;
		}
		this.failure = failure.message;
		this.transitionTo('failed');
		this.presentation?.showFailure(failure.message);
		this.applyLifecycleAction(this.model.fail());
	}

	private onRendererReady(identity: IJScene3DViewportSessionIdentity): void {
		const session = this.model.sessionIdentity;
		if (!session) {
			this.pendingReady = identity;
			return;
		}
		if (sameSession(session, identity)) {
			this.transitionTo('waiting-for-first-frame');
		}
	}

	private async onFrame(frame: VideoFrame, identity: IJScene3DViewportFrameIdentity): Promise<void> {
		const session = this.model.sessionIdentity;
		const presentation = this.presentation;
		if (!session || !presentation || !sameSession(session, identity) || this.model.isTerminal) {
			return;
		}
		const presented = await presentation.presentFrame(frame, identity);
		if (presented && this.presentation === presentation
			&& sameSession(this.model.sessionIdentity, identity) && !this.model.isTerminal) {
			this.transitionTo('rendered');
		}
	}

	private transitionTo(state: JScene3DViewportStartupState): void {
		if (this._startupState === state) {
			return;
		}
		this._startupState = state;
		this.startupStateEmitter.fire(state);
		this.presentation?.showStartupState(state, this.launch.kind);
	}

	override matches(other: EditorInput | unknown): boolean {
		return other instanceof JScene3DViewportEditorInput && other.resource.toString() === this.resource.toString();
	}
}

function sameSession(
	actual: IJScene3DViewportSessionIdentity | undefined,
	expected: IJScene3DViewportSessionIdentity
): boolean {
	return actual?.sessionId === expected.sessionId
		&& actual.rendererGeneration === expected.rendererGeneration;
}
