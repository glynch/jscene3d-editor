/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, sharedTexture } from 'electron';
import { Disposable, IDisposable } from '../../base/common/lifecycle.js';
import { isAbsolute, join } from '../../base/common/path.js';
import { Promises, SymlinkSupport } from '../../base/node/pfs.js';
import { IJScene3DSceneViewOccurrence, IJScene3DSceneViewSnapshot, IJScene3DViewportFailure, IJScene3DViewportFrameIdentity, IJScene3DViewportLaunch, IJScene3DViewportSessionIdentity, isSceneViewSelectableOccurrence, isSceneViewSnapshot, isViewportDimension, isViewportLaunch, isViewportPaneId, isViewportSessionIdentity, stopViewportSessions } from '../../base/parts/sandbox/common/jscene3dViewport.js';
import { validatedIpcMain } from '../../base/parts/ipc/electron-main/ipcMain.js';
import { ILogService } from '../../platform/log/common/log.js';
import { ICodeWindow } from '../../platform/window/electron-main/window.js';
import { IWindowsMainService } from '../../platform/windows/electron-main/windows.js';
import { IJScene3DRendererApi, IJScene3DRendererLaunchRequest, IJScene3DRendererSession } from '../node/jscene3dRendererApi.js';

interface IJScene3DViewportSize {
	readonly width: number;
	readonly height: number;
}

interface IJScene3DPendingSelection {
	readonly revision: number;
	readonly occurrence: IJScene3DSceneViewOccurrence | null;
}

interface IJScene3DMainSession {
	readonly paneId: string;
	readonly rendererGeneration: number;
	readonly window: ICodeWindow;
	readonly webContents: Electron.WebContents;
	readonly frame: Electron.WebFrameMain;
	readonly sessionId: number;
	readonly pid: number;
	readonly launch: IJScene3DViewportLaunch;
	closeListener: IDisposable;
	rendererReady: boolean;
	paused: boolean;
	closing: boolean;
	frameInFlight: boolean;
	firstFramePresented: boolean;
	frameNumber: number;
	surfaceGeneration: number;
	desiredSize: IJScene3DViewportSize;
	pendingSize?: IJScene3DViewportSize;
	pendingSnapshot?: IJScene3DSceneViewSnapshot;
	pendingSelection?: IJScene3DPendingSelection;
	currentSnapshotRevision: number;
	selectionRequest: number;
	frameTimer?: ReturnType<typeof setTimeout>;
	stopPromise?: Promise<void>;
}

/** Owns and isolates the native renderer process associated with each viewport pane. */
export class JScene3DViewportController extends Disposable {
	private readonly sessions = new Map<number, IJScene3DMainSession>();
	private readonly panes = new Map<string, IJScene3DMainSession>();
	private rendererGeneration = 0;
	private readonly pauseListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity) => this.setPaused(event, paneId, session, true);
	private readonly resumeListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity) => this.setPaused(event, paneId, session, false);
	private readonly resizeListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, width: number, height: number) => this.resize(event, paneId, session, width, height);
	private readonly sceneViewUpdateListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, snapshot: IJScene3DSceneViewSnapshot) => this.updateSceneView(event, paneId, session, snapshot);
	private readonly sceneViewSelectListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, occurrence: IJScene3DSceneViewOccurrence | null) => this.selectSceneView(event, paneId, session, revision, occurrence);
	private readonly sceneViewPickListener = (event: Electron.IpcMainEvent, paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, horizontal: number, vertical: number) => this.pickSceneView(event, paneId, session, revision, horizontal, vertical);
	private readonly beforeQuitListener = () => { void this.stopAll('application shutdown'); };

	constructor(
		private readonly renderer: IJScene3DRendererApi,
		private readonly getWindowsMainService: () => IWindowsMainService | undefined,
		private readonly logService: ILogService
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

		const request = await this.createLaunchRequest(launch, width, height);
		const generation = ++this.rendererGeneration;
		let launched: IJScene3DRendererSession | undefined;
		let session: IJScene3DMainSession | undefined;
		try {
			this.logService.info(`[JScene3D viewport] renderer launch requested for pane ${paneId} (${launch.kind} ${launch.sceneAssetId})`);
			launched = this.renderer.launchRenderer(request, {
				onReady: () => session && this.onReady(session),
				onFrameReady: () => session && this.onFrameReady(session),
				onExit: () => session && this.onExit(session),
				onSurfaceReady: (surfaceGeneration, surfaceWidth, surfaceHeight) => session && this.onSurfaceReady(session, surfaceGeneration, surfaceWidth, surfaceHeight),
				onSceneSelection: (requestId, revision, selection) => session && this.onSceneSelection(session, requestId, revision, selection)
			});
			session = {
				paneId,
				rendererGeneration: generation,
				window,
				webContents: event.sender,
				frame,
				sessionId: launched.sessionId,
				pid: launched.pid,
				launch,
				closeListener: Disposable.None,
				rendererReady: false,
				paused: true,
				closing: false,
				frameInFlight: false,
				firstFramePresented: false,
				frameNumber: 0,
				surfaceGeneration: launched.surfaceGeneration,
				desiredSize: { width, height },
				pendingSnapshot: launch.kind === 'scene' ? launch.snapshot : undefined,
				currentSnapshotRevision: -1,
				selectionRequest: 0
			};
			session.closeListener = window.onDidClose(() => { void this.stop(session!, 'workbench window closed'); });
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

	private async createLaunchRequest(launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DRendererLaunchRequest> {
		const javaExecutable = process.env.JSCENE3D_RENDERER_JAVA_EXECUTABLE;
		const runtimeDirectory = process.env.JSCENE3D_RENDERER_RUNTIME_DIRECTORY;
		const contractIdentity = process.env.JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY;
		const buildIdentity = process.env.JSCENE3D_DEVELOPMENT_BUILD_IDENTITY;
		if (!javaExecutable || !isAbsolute(javaExecutable) || !(await this.isFile(javaExecutable))) {
			throw new Error('JSCENE3D_RENDERER_JAVA_EXECUTABLE must identify an absolute Java executable');
		}
		if (!runtimeDirectory || !isAbsolute(runtimeDirectory) || !(await this.isDirectory(runtimeDirectory))) {
			throw new Error('JSCENE3D_RENDERER_RUNTIME_DIRECTORY must identify an extracted renderer runtime');
		}
		if (!contractIdentity || contractIdentity.trim() !== contractIdentity) {
			throw new Error('JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY must identify the verified Java contract');
		}
		if (!buildIdentity || buildIdentity.trim() !== buildIdentity) {
			throw new Error('JSCENE3D_DEVELOPMENT_BUILD_IDENTITY must identify the verified Java runtime build');
		}
		const libraryDirectory = join(runtimeDirectory, 'lib');
		const nativeLibraryDirectory = join(runtimeDirectory, 'native');
		if (!(await this.isDirectory(libraryDirectory)) || !(await this.isDirectory(nativeLibraryDirectory))) {
			throw new Error('The JScene3D renderer runtime must contain lib and native directories');
		}
		const classPath = (await Promises.readdir(libraryDirectory))
			.filter(entry => entry.endsWith('.jar'))
			.sort()
			.map(entry => join(libraryDirectory, entry));
		if (classPath.length === 0) {
			throw new Error('The JScene3D renderer runtime contains no library JARs');
		}
		if (launch.kind === 'game') {
			for (const artifact of launch.runtimeArtifacts) {
				if (!isAbsolute(artifact) || !(await this.isFile(artifact))) {
					throw new Error('A prepared JScene3D project runtime artifact is unavailable');
				}
				if (!classPath.includes(artifact)) {
					classPath.push(artifact);
				}
			}
		}
		if (!isAbsolute(launch.projectRoot) || !(await this.isDirectory(launch.projectRoot))) {
			throw new Error('The prepared JScene3D project root is unavailable');
		}
		if (!isAbsolute(launch.publishedContentRoot)) {
			throw new Error('The prepared JScene3D published-content root must be absolute');
		}
		return {
			javaExecutable,
			workingDirectory: runtimeDirectory,
			nativeLibraryDirectory,
			classPath,
			mainClass: 'io.github.glynch.jscene3d.editor.renderer.process.EditorRendererMain',
			rendererArguments: [
				'--protocol-version=1.0',
				`--contract-identity=${contractIdentity}`,
				`--build-identity=${buildIdentity}`,
				...(launch.kind === 'scene' ? ['--scene-view'] : []),
				`--project-root=${launch.projectRoot}`,
				`--published-content-root=${launch.publishedContentRoot}`,
				`--engine-version=${launch.engineVersion}`,
				`--project-id=${launch.projectId}`,
				`--scene-asset-id=${launch.sceneAssetId}`
			],
			width,
			height
		};
	}

	private async isFile(path: string): Promise<boolean> {
		try {
			return (await SymlinkSupport.stat(path)).stat.isFile();
		} catch {
			return false;
		}
	}

	private async isDirectory(path: string): Promise<boolean> {
		try {
			return (await SymlinkSupport.stat(path)).stat.isDirectory();
		} catch {
			return false;
		}
	}

	private onReady(session: IJScene3DMainSession): void {
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

	private onSurfaceReady(session: IJScene3DMainSession, surfaceGeneration: number, width: number, height: number): void {
		if (!this.isActive(session) || !isViewportDimension(surfaceGeneration) || !isViewportDimension(width) || !isViewportDimension(height)
			|| surfaceGeneration <= session.surfaceGeneration) {
			return;
		}
		session.surfaceGeneration = surfaceGeneration;
		session.pendingSize = undefined;
		this.applyResize(session);
		this.requestFrame(session);
	}

	private onFrameReady(session: IJScene3DMainSession): void {
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

	private applyPendingSnapshot(session: IJScene3DMainSession): boolean {
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

	private applyPendingSelection(session: IJScene3DMainSession): void {
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

	private onSceneSelection(session: IJScene3DMainSession, requestId: number, revision: number, encoded: string): void {
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

	private onExit(session: IJScene3DMainSession): void {
		if (this.isActive(session) && !session.closing) {
			this.fail(session, 'The JScene3D renderer exited unexpectedly.');
		}
	}

	private requestFrame(session: IJScene3DMainSession): void {
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

	private async presentFrame(session: IJScene3DMainSession): Promise<void> {
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

	private applyResize(session: IJScene3DMainSession): void {
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

	private fail(session: IJScene3DMainSession, message: string): void {
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

	private stop(session: IJScene3DMainSession, reason: string): Promise<void> {
		if (session.stopPromise) {
			return session.stopPromise;
		}
		session.closing = true;
		session.frameInFlight = false;
		session.pendingSize = undefined;
		session.pendingSnapshot = undefined;
		session.pendingSelection = undefined;
		if (session.frameTimer) {
			clearTimeout(session.frameTimer);
			session.frameTimer = undefined;
		}
		this.panes.delete(this.paneKey(session.webContents, session.paneId));
		this.sessions.delete(session.sessionId);
		session.closeListener.dispose();
		session.stopPromise = this.renderer.stopRenderer(session.sessionId).finally(() => {
			this.logService.info(`[JScene3D viewport] renderer session ${session.sessionId} stopped (${reason})`);
		});
		return session.stopPromise;
	}

	private stopAll(reason: string): Promise<void> {
		return stopViewportSessions(this.sessions.values(), session => this.stop(session, reason));
	}

	private fromPane(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, paneId: string, identity?: IJScene3DViewportSessionIdentity): IJScene3DMainSession | undefined {
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

	private identity(session: IJScene3DMainSession): IJScene3DViewportSessionIdentity {
		return { sessionId: session.sessionId, rendererGeneration: session.rendererGeneration };
	}

	private isActive(session: IJScene3DMainSession): boolean {
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
		app.removeListener('before-quit', this.beforeQuitListener);
		void this.stopAll('viewport controller disposed');
		super.dispose();
	}
}
