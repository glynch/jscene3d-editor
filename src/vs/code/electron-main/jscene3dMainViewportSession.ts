/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../base/common/lifecycle.js';
import { IJScene3DSceneViewOccurrence, IJScene3DSceneViewSnapshot, IJScene3DViewportLaunch, IJScene3DViewportSessionIdentity } from '../../base/parts/sandbox/common/jscene3dViewport.js';
import { ICodeWindow } from '../../platform/window/electron-main/window.js';
import { IJScene3DRendererApi, IJScene3DRendererSession } from '../node/jscene3dRendererApi.js';

export interface IJScene3DViewportSize {
	readonly width: number;
	readonly height: number;
}

export interface IJScene3DPendingSelection {
	readonly revision: number;
	readonly occurrence: IJScene3DSceneViewOccurrence | null;
}

/** Owns the mutable renderer, native-surface, pane, frame, and shutdown state of one viewport. */
export class JScene3DMainViewportSession extends Disposable {
	closeListener: IDisposable = Disposable.None;
	rendererReady = false;
	paused = true;
	closing = false;
	frameInFlight = false;
	firstFramePresented = false;
	frameNumber = 0;
	surfaceGeneration: number;
	desiredSize: IJScene3DViewportSize;
	pendingSize: IJScene3DViewportSize | undefined;
	pendingSnapshot: IJScene3DSceneViewSnapshot | undefined;
	pendingSelection: IJScene3DPendingSelection | undefined;
	currentSnapshotRevision = -1;
	selectionRequest = 0;
	frameTimer: ReturnType<typeof setTimeout> | undefined;
	stopPromise: Promise<void> | undefined;

	readonly sessionId: number;
	readonly pid: number;

	constructor(
		readonly paneId: string,
		readonly rendererGeneration: number,
		readonly window: ICodeWindow,
		readonly webContents: Electron.WebContents,
		readonly frame: Electron.WebFrameMain,
		readonly launch: IJScene3DViewportLaunch,
		launched: IJScene3DRendererSession,
		width: number,
		height: number,
		private readonly renderer: IJScene3DRendererApi
	) {
		super();
		this.sessionId = launched.sessionId;
		this.pid = launched.pid;
		this.surfaceGeneration = launched.surfaceGeneration;
		this.desiredSize = { width, height };
		this.pendingSnapshot = launch.kind === 'scene' ? launch.snapshot : undefined;
	}

	/** Returns the stable identity carried over IPC for this renderer generation. */
	identity(): IJScene3DViewportSessionIdentity {
		return { sessionId: this.sessionId, rendererGeneration: this.rendererGeneration };
	}

	/** Registers the workbench-window boundary that owns this session. */
	listenForWindowClose(close: () => void): void {
		this.closeListener.dispose();
		this.closeListener = this.window.onDidClose(close);
	}

	/** Stops the renderer exactly once after synchronously relinquishing routing ownership. */
	stop(reason: string, relinquish: () => void, didStop: () => void): Promise<void> {
		if (this.stopPromise) {
			return this.stopPromise;
		}
		this.closing = true;
		this.frameInFlight = false;
		this.pendingSize = undefined;
		this.pendingSnapshot = undefined;
		this.pendingSelection = undefined;
		if (this.frameTimer) {
			clearTimeout(this.frameTimer);
			this.frameTimer = undefined;
		}
		relinquish();
		this.closeListener.dispose();
		this.stopPromise = this.renderer.stopRenderer(this.sessionId).finally(didStop);
		return this.stopPromise;
	}

	override dispose(): void {
		this.closeListener.dispose();
		super.dispose();
	}
}
