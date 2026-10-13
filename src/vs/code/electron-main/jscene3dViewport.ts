/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, sharedTexture } from 'electron';
import { Disposable } from '../../base/common/lifecycle.js';
import { IJScene3DSceneViewNavigation, IJScene3DSceneViewOccurrence, IJScene3DSceneViewSnapshot, IJScene3DTransformPointer, IJScene3DTransformSettings, IJScene3DViewportFailure, IJScene3DViewportFrameIdentity, IJScene3DViewportLaunch, IJScene3DViewportSessionIdentity, isSceneTransformPointer, isSceneTransformSettings, isSceneViewNavigation, isSceneViewSelectableOccurrence, isSceneViewSnapshot, isViewportDimension, isViewportLaunch, isViewportPaneId, isViewportSessionIdentity, isViewportTransform, sceneTransformConfigCommand, sceneTransformPointerCommand, sceneViewNavigationCommand, stopViewportSessions } from '../../base/parts/sandbox/common/jscene3dViewport.js';
import { validatedIpcMain } from '../../base/parts/ipc/electron-main/ipcMain.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IWindowsMainService } from '../../platform/windows/electron-main/windows.js';
import { IJScene3DRendererApi, IJScene3DRendererSession } from '../node/jscene3dRendererApi.js';
import { JScene3DMainViewportSession } from './jscene3dMainViewportSession.js';
import { JScene3DRendererLaunchResolver } from './jscene3dRendererLaunchResolver.js';

/** Owns and isolates the native renderer process associated with each viewport pane. */
export class JScene3DViewportController extends Disposable {
	private readonly sessions = new Map<number, JScene3DMainViewportSession>();
	private readonly panes = new Map<string, JScene3DMainViewportSession>();
	private rendererGeneration = 0;
	private readonly pauseListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity) => this.setPaused(event, paneId, session, true);
	private readonly resumeListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity) => this.setPaused(event, paneId, session, false);
	private readonly resizeListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, width: number, height: number) => this.resize(event, paneId, session, width, height);
	private readonly sceneViewUpdateListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, snapshot: IJScene3DSceneViewSnapshot) => this.updateSceneView(event, paneId, session, snapshot);
	private readonly sceneViewSelectListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, occurrence: IJScene3DSceneViewOccurrence | null) => this.selectSceneView(event, paneId, session, revision, occurrence);
	private readonly sceneViewPickListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, horizontal: number, vertical: number) => this.pickSceneView(event, paneId, session, revision, horizontal, vertical);
	private readonly sceneViewNavigationListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, navigation: IJScene3DSceneViewNavigation) => this.navigateSceneView(event, paneId, session, navigation);
	private readonly sceneTransformConfigListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, settings: IJScene3DTransformSettings) => this.configureSceneTransform(event, paneId, session, settings);
	private readonly sceneTransformPointerListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, pointer: IJScene3DTransformPointer) => this.transformSceneView(event, paneId, session, pointer);
	private readonly beforeQuitListener = () => { void this.stopAll('application shutdown'); };

	constructor(
		private readonly renderer: IJScene3DRendererApi,
		private readonly getWindowsMainService: () => IWindowsMainService | undefined,
		private readonly logService: ILogService,
		private readonly launchResolver = new JScene3DRendererLaunchResolver()
	) {
		super();
		validatedIpcMain.handle('vscode:jscene3dViewport:start', async (event, paneId: string, launch: IJScene3DViewportLaunch, width: number, height: number) => this.start(event, paneId, launch, width, height));
		validatedIpcMain.handle('vscode:jscene3dViewport:stop', async (event, paneId: string, session?: IJScene3DViewportSessionIdentity) => this.stopFromPane(event, paneId, session));
		validatedIpcMain.on('vscode:jscene3dViewport:pause', this.pauseListener);
		validatedIpcMain.on('vscode:jscene3dViewport:resume', this.resumeListener);
		validatedIpcMain.on('vscode:jscene3dViewport:resize', this.resizeListener);
		validatedIpcMain.on('vscode:jscene3dViewport:updateSceneView', this.sceneViewUpdateListener);
		validatedIpcMain.on('vscode:jscene3dViewport:selectSceneView', this.sceneViewSelectListener);
		validatedIpcMain.on('vscode:jscene3dViewport:pickSceneView', this.sceneViewPickListener);
		validatedIpcMain.on('vscode:jscene3dViewport:navigateSceneView', this.sceneViewNavigationListener);
		validatedIpcMain.on('vscode:jscene3dViewport:configureSceneTransform', this.sceneTransformConfigListener);
		validatedIpcMain.on('vscode:jscene3dViewport:transformSceneView', this.sceneTransformPointerListener);
		app.on('before-quit', this.beforeQuitListener);
	}

	private paneKey(webContents: Electron.WebContents, paneId: string): string {
		return `${webContents.id}:${paneId}`;
	}

	private async start(event: Electron.IpcMainInvokeEvent, paneId: string, launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DViewportSessionIdentity> {
		const window = this.getWindowsMainService()?.getWindowByWebContents(event.sender);
		const frame = event.sender.mainFrame;
		if (!window?.win || event.senderFrame !== frame || !isViewportPaneId(paneId) || !isViewportLaunch(launch) || !isViewportDimension(width) || !isViewportDimension(height)) {
			throw new Error('JScene3D native viewport requires a valid main-frame pane and physical viewport size');
		}

		const paneKey = this.paneKey(event.sender, paneId);
		const existing = this.panes.get(paneKey);
		if (existing) {
			if (existing.closing || existing.frame !== frame) {
				throw new Error('JScene3D native viewport session is closing');
			}
			return this.identity(existing);
		}

		const request = await this.launchResolver.resolve(launch, width, height);
		const generation = ++this.rendererGeneration;
		let launched: IJScene3DRendererSession | undefined;
		let session: JScene3DMainViewportSession | undefined;
		try {
			this.logService.info(`[JScene3D viewport] renderer launch requested for pane ${paneId} (${launch.kind} ${launch.sceneAssetId})`);
			launched = this.renderer.launchRenderer(request, {
				onReady: () => session && this.onReady(session),
				onFrameReady: () => session && this.onFrameReady(session),
				onExit: () => session && this.onExit(session),
				onSurfaceReady: (surfaceGeneration, surfaceWidth, surfaceHeight) => session && this.onSurfaceReady(session, surfaceGeneration, surfaceWidth, surfaceHeight),
				onSceneSelection: (requestId, revision, selection) => session && this.onSceneSelection(session, requestId, revision, selection),
				onSceneTransform: transform => session && this.onSceneTransform(session, transform)
			});
			session = new JScene3DMainViewportSession(
				paneId,
				generation,
				window,
				event.sender,
				frame,
				launch,
				launched,
				width,
				height,
				this.renderer
			);
			session.listenForWindowClose(() => { void this.stop(session!, 'workbench window closed'); });
			this.panes.set(paneKey, session);
			this.sessions.set(session.sessionId, session);
			this.logService.info(`[JScene3D viewport] renderer process ${session.pid} launched for session ${session.sessionId} and pane ${paneId}`);
			return this.identity(session);
		} catch (error) {
			if (launched) {
				await this.renderer.stopRenderer(launched.sessionId);
			}
			throw error;
		}
	}

	private onReady(session: JScene3DMainViewportSession): void {
		if (!this.isActive(session) || session.rendererReady) {
			return;
		}
		session.rendererReady = true;
		this.logService.info(`[JScene3D viewport] renderer session ${session.sessionId} ready for pane ${session.paneId}`);
		if (!session.frame.isDestroyed()) {
			session.frame.send('vscode:jscene3dViewport:ready', { paneId: session.paneId, ...this.identity(session) });
		}
		if (!this.applyPendingSnapshot(session)) {
			return;
		}
		if (session.paused) {
			this.renderer.pauseRenderer(session.sessionId);
			return;
		}
		this.applyResize(session);
		this.requestFrame(session);
	}

	private onSurfaceReady(session: JScene3DMainViewportSession, surfaceGeneration: number, width: number, height: number): void {
		if (!this.isActive(session) || !isViewportDimension(surfaceGeneration) || !isViewportDimension(width) || !isViewportDimension(height)
			|| surfaceGeneration <= session.surfaceGeneration) {
			return;
		}
		session.surfaceGeneration = surfaceGeneration;
		session.pendingSize = undefined;
		this.applyResize(session);
		this.requestFrame(session);
	}

	private onFrameReady(session: JScene3DMainViewportSession): void {
		if (!this.isActive(session) || !session.frameInFlight) {
			return;
		}
		if (session.pendingSnapshot) {
			session.frameInFlight = false;
			if (this.applyPendingSnapshot(session)) {
				this.requestFrame(session);
			}
			return;
		}
		if (session.paused) {
			session.frameInFlight = false;
			return;
		}
		void this.presentFrame(session).then(() => {
			if (!this.isActive(session)) {
				return;
			}
			if (!session.firstFramePresented) {
				session.firstFramePresented = true;
				this.logService.info(`[JScene3D viewport] first frame presented for session ${session.sessionId} and pane ${session.paneId}`);
			}
			session.frameInFlight = false;
			session.frameTimer = setTimeout(() => {
				session.frameTimer = undefined;
				this.requestFrame(session);
			}, 16);
		}, error => this.fail(session, `frame presentation failed: ${error instanceof Error ? error.message : String(error)}`));
	}

	private updateSceneView(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, snapshot: IJScene3DSceneViewSnapshot): void {
		const session = this.fromPane(event, paneId, identity);
		if (!session || session.launch.kind !== 'scene' || !isSceneViewSnapshot(snapshot)
			|| snapshot.sceneAssetId !== session.launch.sceneAssetId) {
			return;
		}
		const newestRevision = Math.max(session.currentSnapshotRevision, session.pendingSnapshot?.revision ?? -1);
		if (snapshot.revision <= newestRevision) {
			return;
		}
		session.pendingSnapshot = snapshot;
		if (session.pendingSelection?.revision !== snapshot.revision) {
			session.pendingSelection = undefined;
		}
		if (session.rendererReady && !session.frameInFlight && this.applyPendingSnapshot(session)) {
			this.requestFrame(session);
		}
	}

	private applyPendingSnapshot(session: JScene3DMainViewportSession): boolean {
		const snapshot = session.pendingSnapshot;
		if (!snapshot) {
			return true;
		}
		const encoded = Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64url');
		if (!this.renderer.sendRendererMessage(session.sessionId, `SCENE_SNAPSHOT ${encoded}`)) {
			this.fail(session, 'The native renderer transport could not queue the Scene View snapshot.');
			return false;
		}
		session.currentSnapshotRevision = snapshot.revision;
		session.pendingSnapshot = undefined;
		this.applyPendingSelection(session);
		return true;
	}

	private selectSceneView(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, revision: number, occurrence: IJScene3DSceneViewOccurrence | null): void {
		const session = this.fromPane(event, paneId, identity);
		const newestRevision = session?.pendingSnapshot?.revision ?? session?.currentSnapshotRevision;
		if (!session || session.launch.kind !== 'scene' || revision !== newestRevision
			|| (occurrence !== null && (!isSceneViewSelectableOccurrence(occurrence)
				|| occurrence.rootDefinitionAssetId !== session.launch.sceneAssetId))) {
			return;
		}
		session.pendingSelection = { revision, occurrence };
		this.applyPendingSelection(session);
	}

	private applyPendingSelection(session: JScene3DMainViewportSession): void {
		const pending = session.pendingSelection;
		if (!pending || !session.rendererReady || pending.revision !== session.currentSnapshotRevision) {
			return;
		}
		const encoded = pending.occurrence === null
			? 'NONE'
			: Buffer.from(JSON.stringify(pending.occurrence), 'utf8').toString('base64url');
		if (this.renderer.sendRendererMessage(session.sessionId, `SCENE_SELECT ${pending.revision} ${encoded}`)) {
			session.pendingSelection = undefined;
		}
	}

	private pickSceneView(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, revision: number, horizontal: number, vertical: number): void {
		const session = this.fromPane(event, paneId, identity);
		if (!session || session.launch.kind !== 'scene' || revision !== session.currentSnapshotRevision
			|| !Number.isFinite(horizontal) || horizontal < -1 || horizontal > 1
			|| !Number.isFinite(vertical) || vertical < -1 || vertical > 1) {
			return;
		}
		const requestId = ++session.selectionRequest;
		this.renderer.sendRendererMessage(session.sessionId, `SCENE_PICK ${requestId} ${revision} ${horizontal} ${vertical}`);
	}

	private navigateSceneView(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, navigation: IJScene3DSceneViewNavigation): void {
		const session = this.fromPane(event, paneId, identity);
		if (!session || session.launch.kind !== 'scene' || !session.rendererReady || !isSceneViewNavigation(navigation)) {
			return;
		}
		const command = sceneViewNavigationCommand(navigation);
		this.renderer.sendRendererMessage(session.sessionId, command);
	}

	private configureSceneTransform(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, settings: IJScene3DTransformSettings): void {
		const session = this.fromPane(event, paneId, identity);
		if (session?.launch.kind === 'scene' && session.rendererReady && isSceneTransformSettings(settings)) {
			this.renderer.sendRendererMessage(session.sessionId, sceneTransformConfigCommand(settings));
		}
	}

	private transformSceneView(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, pointer: IJScene3DTransformPointer): void {
		const session = this.fromPane(event, paneId, identity);
		if (session?.launch.kind === 'scene' && session.rendererReady && isSceneTransformPointer(pointer)) {
			const selectionRequest = pointer.phase === 'begin' ? ++session.selectionRequest : undefined;
			this.renderer.sendRendererMessage(
				session.sessionId,
				sceneTransformPointerCommand(pointer, selectionRequest, session.currentSnapshotRevision ?? 0)
			);
		}
	}

	private onSceneTransform(session: JScene3DMainViewportSession, encoded: string): void {
		if (!this.isActive(session) || session.launch.kind !== 'scene') {
			return;
		}
		try {
			const decoded = {
				...JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
				paneId: session.paneId,
				...this.identity(session)
			};
			if (!isViewportTransform(decoded) || decoded.definitionAssetId !== session.launch.sceneAssetId) {
				return;
			}
			if (!session.frame.isDestroyed()) {
				session.frame.send('vscode:jscene3dViewport:transform', decoded);
			}
		} catch {
			// Malformed renderer events are ignored at the process boundary.
		}
	}

	private onSceneSelection(session: JScene3DMainViewportSession, requestId: number, revision: number, encoded: string): void {
		if (!this.isActive(session) || session.launch.kind !== 'scene'
			|| requestId !== session.selectionRequest || revision !== session.currentSnapshotRevision || encoded === 'STALE') {
			return;
		}
		let occurrence: IJScene3DSceneViewOccurrence | null = null;
		if (encoded !== 'NONE') {
			try {
				const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
				if (!isSceneViewSelectableOccurrence(decoded) || decoded.rootDefinitionAssetId !== session.launch.sceneAssetId) {
					return;
				}
				occurrence = decoded;
			} catch {
				return;
			}
		}
		if (!session.frame.isDestroyed()) {
			session.frame.send('vscode:jscene3dViewport:selection', {
				paneId: session.paneId,
				...this.identity(session),
				revision,
				occurrence
			});
		}
	}

	private onExit(session: JScene3DMainViewportSession): void {
		if (this.isActive(session) && !session.closing) {
			this.fail(session, 'The JScene3D renderer exited unexpectedly.');
		}
	}

	private requestFrame(session: JScene3DMainViewportSession): void {
		if (!this.isActive(session) || !session.rendererReady || session.paused || session.frameInFlight || session.pendingSize) {
			return;
		}
		session.frameNumber++;
		session.frameInFlight = true;
		if (!this.renderer.sendRendererMessage(session.sessionId, `FRAME ${session.frameNumber}`)) {
			session.frameInFlight = false;
			this.fail(session, 'The JScene3D renderer rejected a frame request.');
		}
	}

	private async presentFrame(session: JScene3DMainViewportSession): Promise<void> {
		const surface = this.renderer.getSurface(session.sessionId);
		if (!surface || surface.surfaceGeneration !== session.surfaceGeneration) {
			throw new Error('renderer surface is unavailable or stale');
		}
		const imported = sharedTexture.importSharedTexture({
			textureInfo: {
				pixelFormat: 'bgra',
				codedSize: { width: surface.width, height: surface.height },
				visibleRect: { x: 0, y: 0, width: surface.width, height: surface.height },
				timestamp: session.frameNumber,
				handle: { ioSurface: surface.handle }
			}
		});
		const identity: IJScene3DViewportFrameIdentity = {
			...this.identity(session),
			paneId: session.paneId,
			surfaceGeneration: surface.surfaceGeneration,
			frameNumber: session.frameNumber
		};
		try {
			await sharedTexture.sendSharedTexture({ frame: session.frame, importedSharedTexture: imported }, identity);
		} finally {
			imported.release();
		}
	}

	private resize(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, width: number, height: number): void {
		const session = this.fromPane(event, paneId, identity);
		if (!session || !isViewportDimension(width) || !isViewportDimension(height)) {
			return;
		}
		if (session.desiredSize.width === width && session.desiredSize.height === height) {
			return;
		}
		session.desiredSize = { width, height };
		this.applyResize(session);
	}

	private applyResize(session: JScene3DMainViewportSession): void {
		if (!this.isActive(session) || !session.rendererReady || session.pendingSize) {
			return;
		}
		const surface = this.renderer.getSurface(session.sessionId);
		if (!surface || (surface.width === session.desiredSize.width && surface.height === session.desiredSize.height)) {
			return;
		}
		if (this.renderer.replaceSurface(session.sessionId, surface.surfaceGeneration, session.desiredSize.width, session.desiredSize.height)) {
			session.pendingSize = session.desiredSize;
		}
	}

	private setPaused(event: Electron.IpcMainEvent, paneId: string, identity: IJScene3DViewportSessionIdentity, paused: boolean): void {
		const session = this.fromPane(event, paneId, identity);
		if (!session || session.paused === paused) {
			return;
		}
		session.paused = paused;
		if (!session.rendererReady) {
			return;
		}
		if (paused) {
			if (session.frameTimer) {
				clearTimeout(session.frameTimer);
				session.frameTimer = undefined;
			}
			this.renderer.pauseRenderer(session.sessionId);
		} else {
			this.renderer.resumeRenderer(session.sessionId);
			this.applyResize(session);
			this.requestFrame(session);
		}
	}

	private fail(session: JScene3DMainViewportSession, message: string): void {
		if (!this.isActive(session) || session.closing) {
			return;
		}
		this.logService.error(`[JScene3D viewport] session ${session.sessionId} failed: ${message}`);
		const failure: IJScene3DViewportFailure = { paneId: session.paneId, session: this.identity(session), message };
		if (!session.frame.isDestroyed()) {
			session.frame.send('vscode:jscene3dViewport:failed', failure);
		}
		void this.stop(session, message);
	}

	private async stopFromPane(event: Electron.IpcMainInvokeEvent, paneId: string, identity?: IJScene3DViewportSessionIdentity): Promise<void> {
		const session = this.fromPane(event, paneId, identity);
		if (session) {
			await this.stop(session, 'viewport pane disposed');
		}
	}

	private stop(session: JScene3DMainViewportSession, reason: string): Promise<void> {
		return session.stop(
			reason,
			() => {
				this.panes.delete(this.paneKey(session.webContents, session.paneId));
				this.sessions.delete(session.sessionId);
			},
			() => this.logService.info(`[JScene3D viewport] renderer session ${session.sessionId} stopped (${reason})`)
		);
	}

	private stopAll(reason: string): Promise<void> {
		return stopViewportSessions(this.sessions.values(), session => this.stop(session, reason));
	}

	private fromPane(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, paneId: string, identity?: IJScene3DViewportSessionIdentity): JScene3DMainViewportSession | undefined {
		if (!isViewportPaneId(paneId) || (identity && !isViewportSessionIdentity(identity))) {
			return undefined;
		}
		const session = this.panes.get(this.paneKey(event.sender, paneId));
		if (!session || session.closing || session.frame !== event.senderFrame || event.sender.mainFrame !== event.senderFrame) {
			return undefined;
		}
		if (identity && (session.sessionId !== identity.sessionId || session.rendererGeneration !== identity.rendererGeneration)) {
			return undefined;
		}
		return session;
	}

	private identity(session: JScene3DMainViewportSession): IJScene3DViewportSessionIdentity {
		return session.identity();
	}

	private isActive(session: JScene3DMainViewportSession): boolean {
		return this.sessions.get(session.sessionId) === session && !session.closing;
	}

	override dispose(): void {
		validatedIpcMain.removeHandler('vscode:jscene3dViewport:start');
		validatedIpcMain.removeHandler('vscode:jscene3dViewport:stop');
		validatedIpcMain.removeListener('vscode:jscene3dViewport:pause', this.pauseListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:resume', this.resumeListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:resize', this.resizeListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:updateSceneView', this.sceneViewUpdateListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:selectSceneView', this.sceneViewSelectListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:pickSceneView', this.sceneViewPickListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:navigateSceneView', this.sceneViewNavigationListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:configureSceneTransform', this.sceneTransformConfigListener);
		validatedIpcMain.removeListener('vscode:jscene3dViewport:transformSceneView', this.sceneTransformPointerListener);
		app.removeListener('before-quit', this.beforeQuitListener);
		void this.stopAll('viewport controller disposed');
		super.dispose();
	}
}
