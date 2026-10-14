/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSceneTransformPointer, isSceneTransformSettings, isSceneViewNavigation, isSceneViewOccurrence, isSceneViewSnapshot, isViewportCameraState, isViewportDimension, isViewportFrameIdentity, isViewportLaunch, isViewportPaneId, isViewportSessionIdentity, isViewportTransform } from '../common/jscene3dViewportCodec.js';
import { IJScene3DViewportBridge, IJScene3DViewportCameraState, IJScene3DViewportFailure, IJScene3DViewportFrameIdentity, IJScene3DViewportSelection, IJScene3DViewportSessionIdentity, IJScene3DViewportTransform } from '../common/jscene3dViewportProtocol.js';

interface JScene3DPaneRegistration {
	readonly onReady: (session: IJScene3DViewportSessionIdentity) => void;
	readonly onFrame: (frame: VideoFrame, identity: IJScene3DViewportFrameIdentity) => Promise<void>;
	readonly onFailure: (failure: IJScene3DViewportFailure) => void;
	readonly onSelection: (selection: IJScene3DViewportSelection) => void;
	readonly onTransform: (transform: IJScene3DViewportTransform) => void;
	readonly onCameraState: (cameraState: IJScene3DViewportCameraState) => void;
	session?: IJScene3DViewportSessionIdentity;
	pendingReady?: IJScene3DViewportSessionIdentity;
	pendingCameraState?: IJScene3DViewportCameraState;
	presentationGeneration: number;
	surfaceGeneration: number;
	frameNumber: number;
	width: number;
	height: number;
	paused: boolean;
}

/** Creates the validated JScene3D native-viewport bridge exposed across the sandbox boundary. */
export function createJScene3DViewportBridge(
	ipcRenderer: Electron.IpcRenderer,
	sharedTexture: typeof Electron.sharedTexture
): IJScene3DViewportBridge {
	const panes = new Map<string, JScene3DPaneRegistration>();
	const sameSession = (left: IJScene3DViewportSessionIdentity | undefined, right: IJScene3DViewportSessionIdentity): boolean =>
		left?.sessionId === right.sessionId && left.rendererGeneration === right.rendererGeneration;

	sharedTexture.setSharedTextureReceiver(async (data: Electron.ReceivedSharedTextureData, identity: unknown) => {
		const texture = data.importedSharedTexture;
		let frame: VideoFrame | undefined;
		try {
			if (!isViewportFrameIdentity(identity)) {
				return;
			}
			const registration = panes.get(identity.paneId);
			if (!registration || !sameSession(registration.session, identity)
				|| identity.presentationGeneration !== registration.presentationGeneration
				|| identity.surfaceGeneration < registration.surfaceGeneration
				|| (identity.surfaceGeneration === registration.surfaceGeneration && identity.frameNumber <= registration.frameNumber)) {
				return;
			}
			frame = texture.getVideoFrame();
			registration.surfaceGeneration = identity.surfaceGeneration;
			registration.frameNumber = identity.frameNumber;
			await registration.onFrame(frame, identity);
		} finally {
			frame?.close();
			texture.release();
		}
	});

	ipcRenderer.on('vscode:jscene3dViewport:failed', (_event, failure: unknown) => {
		if (!failure || typeof failure !== 'object') {
			return;
		}
		const candidate = failure as Partial<IJScene3DViewportFailure>;
		if (!isViewportPaneId(candidate.paneId) || typeof candidate.message !== 'string' || candidate.message.length === 0) {
			return;
		}
		const registration = panes.get(candidate.paneId);
		if (!registration || (candidate.session && !sameSession(registration.session, candidate.session))) {
			return;
		}
		registration.onFailure(candidate as IJScene3DViewportFailure);
		registration.session = undefined;
		registration.pendingReady = undefined;
		registration.pendingCameraState = undefined;
		registration.presentationGeneration = 0;
		registration.surfaceGeneration = 0;
		registration.frameNumber = 0;
		registration.paused = true;
	});

	ipcRenderer.on('vscode:jscene3dViewport:ready', (_event, ready: unknown) => {
		if (!ready || typeof ready !== 'object') {
			return;
		}
		const candidate = ready as Partial<IJScene3DViewportSessionIdentity> & { paneId?: unknown };
		const paneId = candidate.paneId;
		if (!isViewportPaneId(paneId) || !isViewportSessionIdentity(candidate)) {
			return;
		}
		const registration = panes.get(paneId);
		if (registration?.session === undefined) {
			if (registration) {
				registration.pendingReady = candidate;
			}
		} else if (registration && sameSession(registration.session, candidate)) {
			registration.onReady(candidate);
		}
	});

	ipcRenderer.on('vscode:jscene3dViewport:selection', (_event, selection: unknown) => {
		if (!selection || typeof selection !== 'object') {
			return;
		}
		const candidate = selection as Partial<IJScene3DViewportSelection>;
		if (!isViewportPaneId(candidate.paneId) || !isViewportSessionIdentity(selection)
			|| !Number.isInteger(candidate.revision) || candidate.revision! < 0
			|| (candidate.occurrence !== null && !isSceneViewOccurrence(candidate.occurrence))) {
			return;
		}
		const registration = panes.get(candidate.paneId);
		if (registration && sameSession(registration.session, selection)) {
			registration.onSelection(candidate as IJScene3DViewportSelection);
		}
	});

	ipcRenderer.on('vscode:jscene3dViewport:transform', (_event, transform: unknown) => {
		if (!isViewportTransform(transform)) {
			return;
		}
		const registration = panes.get(transform.paneId);
		if (registration && sameSession(registration.session, transform)) {
			registration.onTransform(transform);
		}
	});

	ipcRenderer.on('vscode:jscene3dViewport:cameraState', (_event, cameraState: unknown) => {
		if (!isViewportCameraState(cameraState)) {
			return;
		}
		const registration = panes.get(cameraState.paneId);
		if (!registration) {
			return;
		}
		if (registration.session === undefined) {
			registration.pendingCameraState = cameraState;
		} else if (sameSession(registration.session, cameraState)) {
			registration.onCameraState(cameraState);
		}
	});

	return {
		registerPane(paneId, onReady, onFrame, onFailure, onSelection, onTransform, onCameraState): void {
			if (!isViewportPaneId(paneId) || typeof onReady !== 'function' || typeof onFrame !== 'function'
				|| typeof onFailure !== 'function' || typeof onSelection !== 'function' || typeof onTransform !== 'function'
				|| typeof onCameraState !== 'function' || panes.has(paneId)) {
				throw new Error('Invalid or duplicate JScene3D native viewport pane registration');
			}
			panes.set(paneId, {
				onReady,
				onFrame,
				onFailure,
				onSelection,
				onTransform,
				onCameraState,
				presentationGeneration: 0,
				surfaceGeneration: 0,
				frameNumber: 0,
				width: 0,
				height: 0,
				paused: true
			});
		},
		unregisterPane(paneId): void {
			if (isViewportPaneId(paneId)) {
				panes.delete(paneId);
			}
		},
		async start(paneId, launch, width, height): Promise<IJScene3DViewportSessionIdentity> {
			const registration = panes.get(paneId);
			if (!registration || !isViewportLaunch(launch) || !isViewportDimension(width) || !isViewportDimension(height)) {
				throw new Error('Invalid JScene3D native viewport start request');
			}
			const session = await ipcRenderer.invoke('vscode:jscene3dViewport:start', paneId, launch, width, height);
			if (!isViewportSessionIdentity(session)) {
				throw new Error('Invalid JScene3D native viewport session identity');
			}
			registration.session = session;
			registration.presentationGeneration = 0;
			registration.surfaceGeneration = 0;
			registration.frameNumber = 0;
			registration.width = width;
			registration.height = height;
			registration.paused = true;
			const pendingReady = registration.pendingReady;
			registration.pendingReady = undefined;
			if (pendingReady && sameSession(session, pendingReady)) {
				registration.onReady(pendingReady);
			}
			const pendingCameraState = registration.pendingCameraState;
			registration.pendingCameraState = undefined;
			if (pendingCameraState && sameSession(session, pendingCameraState)) {
				registration.onCameraState(pendingCameraState);
			}
			return session;
		},
		updateSceneView(paneId, session, snapshot): void {
			if (sameSession(panes.get(paneId)?.session, session) && isSceneViewSnapshot(snapshot)) {
				ipcRenderer.send('vscode:jscene3dViewport:updateSceneView', paneId, session, snapshot);
			}
		},
		selectSceneView(paneId, session, revision, occurrence): void {
			if (sameSession(panes.get(paneId)?.session, session) && Number.isInteger(revision) && revision >= 0
				&& (occurrence === null || isSceneViewOccurrence(occurrence))) {
				ipcRenderer.send('vscode:jscene3dViewport:selectSceneView', paneId, session, revision, occurrence);
			}
		},
		pickSceneView(paneId, session, revision, horizontal, vertical): void {
			if (sameSession(panes.get(paneId)?.session, session) && Number.isInteger(revision) && revision >= 0
				&& Number.isFinite(horizontal) && horizontal >= -1 && horizontal <= 1
				&& Number.isFinite(vertical) && vertical >= -1 && vertical <= 1) {
				ipcRenderer.send('vscode:jscene3dViewport:pickSceneView', paneId, session, revision, horizontal, vertical);
			}
		},
		navigateSceneView(paneId, session, navigation): void {
			if (sameSession(panes.get(paneId)?.session, session) && isSceneViewNavigation(navigation)) {
				ipcRenderer.send('vscode:jscene3dViewport:navigateSceneView', paneId, session, navigation);
			}
		},
		configureSceneTransform(paneId, session, settings): void {
			if (sameSession(panes.get(paneId)?.session, session) && isSceneTransformSettings(settings)) {
				ipcRenderer.send('vscode:jscene3dViewport:configureSceneTransform', paneId, session, settings);
			}
		},
		transformSceneView(paneId, session, pointer): void {
			if (sameSession(panes.get(paneId)?.session, session) && isSceneTransformPointer(pointer)) {
				ipcRenderer.send('vscode:jscene3dViewport:transformSceneView', paneId, session, pointer);
			}
		},
		resize(paneId, session, width, height): void {
			const registration = panes.get(paneId);
			if (registration && sameSession(registration.session, session) && isViewportDimension(width) && isViewportDimension(height)
				&& (registration.width !== width || registration.height !== height)) {
				registration.width = width;
				registration.height = height;
				registration.presentationGeneration++;
				ipcRenderer.send('vscode:jscene3dViewport:resize', paneId, session, width, height);
			}
		},
		pause(paneId, session): void {
			const registration = panes.get(paneId);
			if (registration && sameSession(registration.session, session) && !registration.paused) {
				registration.paused = true;
				registration.presentationGeneration++;
				ipcRenderer.send('vscode:jscene3dViewport:pause', paneId, session);
			}
		},
		resume(paneId, session): void {
			const registration = panes.get(paneId);
			if (registration && sameSession(registration.session, session) && registration.paused) {
				registration.paused = false;
				ipcRenderer.send('vscode:jscene3dViewport:resume', paneId, session);
			}
		},
		async stop(paneId, session): Promise<void> {
			const registration = panes.get(paneId);
			if (!registration || (session && !sameSession(registration.session, session))) {
				return;
			}
			registration.session = undefined;
			registration.pendingReady = undefined;
			registration.pendingCameraState = undefined;
			registration.presentationGeneration = 0;
			registration.surfaceGeneration = 0;
			registration.frameNumber = 0;
			registration.width = 0;
			registration.height = 0;
			registration.paused = true;
			await ipcRenderer.invoke('vscode:jscene3dViewport:stop', paneId, session);
		}
	};
}
