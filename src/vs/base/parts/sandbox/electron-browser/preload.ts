/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(function () {

	const { ipcRenderer, webFrame, contextBridge, webUtils, sharedTexture } = require('electron');

	type ISandboxConfiguration = import('../common/sandboxTypes.js').ISandboxConfiguration;
	type IJScene3DViewportBridge = import('../common/jscene3dViewport.js').IJScene3DViewportBridge;
	type IJScene3DViewportFailure = import('../common/jscene3dViewport.js').IJScene3DViewportFailure;
	type IJScene3DViewportFrameIdentity = import('../common/jscene3dViewport.js').IJScene3DViewportFrameIdentity;
	type IJScene3DViewportLaunch = import('../common/jscene3dViewport.js').IJScene3DViewportLaunch;
	type IJScene3DSceneViewSnapshot = import('../common/jscene3dViewport.js').IJScene3DSceneViewSnapshot;
	type IJScene3DViewportSessionIdentity = import('../common/jscene3dViewport.js').IJScene3DViewportSessionIdentity;

	//#region Utilities

	function validateIPC(channel: string): true | never {
		if (!channel?.startsWith('vscode:')) {
			throw new Error(`Unsupported event IPC channel '${channel}'`);
		}

		return true;
	}

	function parseArgv(key: string): string | undefined {
		for (const arg of process.argv) {
			if (arg.indexOf(`--${key}=`) === 0) {
				return arg.split('=')[1];
			}
		}

		return undefined;
	}

	//#endregion

	//#region Resolve Configuration

	let configuration: ISandboxConfiguration | undefined = undefined;

	const resolveConfiguration: Promise<ISandboxConfiguration> = (async () => {
		const windowConfigIpcChannel = parseArgv('vscode-window-config');
		if (!windowConfigIpcChannel) {
			throw new Error('Preload: did not find expected vscode-window-config in renderer process arguments list.');
		}

		try {
			validateIPC(windowConfigIpcChannel);

			// Resolve configuration from electron-main
			const resolvedConfiguration: ISandboxConfiguration = configuration = await ipcRenderer.invoke(windowConfigIpcChannel);

			// Apply `userEnv` directly
			Object.assign(process.env, resolvedConfiguration.userEnv);

			// Apply zoom level early before even building the
			// window DOM elements to avoid UI flicker. We always
			// have to set the zoom level from within the window
			// because Chrome has it's own way of remembering zoom
			// settings per origin (if vscode-file:// is used) and
			// we want to ensure that the user configuration wins.
			webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);

			return resolvedConfiguration;
		} catch (error) {
			throw new Error(`Preload: unable to fetch vscode-window-config: ${error}`);
		}
	})();

	//#endregion

	//#region Resolve Shell Environment

	/**
	 * If VSCode is not run from a terminal, we should resolve additional
	 * shell specific environment from the OS shell to ensure we are seeing
	 * all development related environment variables. We do this from the
	 * main process because it may involve spawning a shell.
	 */
	const resolveShellEnv: Promise<typeof process.env> = (async () => {

		// Resolve `userEnv` from configuration and
		// `shellEnv` from the main side
		const [userEnv, shellEnv] = await Promise.all([
			(async () => (await resolveConfiguration).userEnv)(),
			ipcRenderer.invoke('vscode:fetchShellEnv')
		]);

		return { ...process.env, ...shellEnv, ...userEnv };
	})();

	//#endregion

	//#region Globals Definition

	type JScene3DPaneRegistration = {
		readonly onFrame: (frame: VideoFrame, identity: IJScene3DViewportFrameIdentity) => Promise<void>;
		readonly onFailure: (failure: IJScene3DViewportFailure) => void;
		session?: IJScene3DViewportSessionIdentity;
		surfaceGeneration: number;
		frameNumber: number;
	};

	const jscene3dPanes = new Map<string, JScene3DPaneRegistration>();
	const validPaneId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
	const validDimension = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0 && (value as number) <= 16384;
	const validSession = (value: unknown): value is IJScene3DViewportSessionIdentity => {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as Partial<IJScene3DViewportSessionIdentity>;
		return Number.isInteger(candidate.sessionId) && candidate.sessionId! > 0
			&& Number.isInteger(candidate.rendererGeneration) && candidate.rendererGeneration! > 0;
	};
	const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
	const validLaunch = (value: unknown): value is IJScene3DViewportLaunch => {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as Partial<IJScene3DViewportLaunch>;
		return validPaneId(candidate.viewportId)
			&& nonEmpty(candidate.connectionGeneration)
			&& Number.isInteger(candidate.projectGeneration) && candidate.projectGeneration! > 0
			&& nonEmpty(candidate.projectId) && nonEmpty(candidate.projectName)
			&& nonEmpty(candidate.projectRoot) && nonEmpty(candidate.publishedContentRoot)
			&& nonEmpty(candidate.engineVersion) && nonEmpty(candidate.sceneAssetId) && nonEmpty(candidate.sceneName)
			&& (candidate.kind === 'game'
				? Array.isArray(candidate.runtimeArtifacts) && candidate.runtimeArtifacts.every(nonEmpty)
				: candidate.kind === 'scene' && !('runtimeArtifacts' in candidate) && validSceneViewSnapshot(candidate.snapshot)
					&& candidate.snapshot.sceneAssetId === candidate.sceneAssetId);
	};
	const validSceneViewSnapshot = (value: unknown): value is IJScene3DSceneViewSnapshot => {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as Partial<IJScene3DSceneViewSnapshot>;
		return nonEmpty(candidate.sceneAssetId)
			&& Number.isInteger(candidate.revision) && candidate.revision! >= 0
			&& Array.isArray(candidate.occurrences);
	};
	const validFrameIdentity = (value: unknown): value is IJScene3DViewportFrameIdentity => {
		if (!validSession(value)) {
			return false;
		}
		const candidate = value as Partial<IJScene3DViewportFrameIdentity>;
		return validPaneId(candidate.paneId)
			&& Number.isInteger(candidate.surfaceGeneration) && candidate.surfaceGeneration! > 0
			&& Number.isInteger(candidate.frameNumber) && candidate.frameNumber! > 0;
	};
	const sameSession = (left: IJScene3DViewportSessionIdentity | undefined, right: IJScene3DViewportSessionIdentity): boolean =>
		left?.sessionId === right.sessionId && left.rendererGeneration === right.rendererGeneration;

	sharedTexture.setSharedTextureReceiver(async (data: Electron.ReceivedSharedTextureData, identity: unknown) => {
		const texture = data.importedSharedTexture;
		let frame: VideoFrame | undefined;
		try {
			if (!validFrameIdentity(identity)) {
				return;
			}
			const registration = jscene3dPanes.get(identity.paneId);
			if (!registration || !sameSession(registration.session, identity)
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

	ipcRenderer.on('vscode:jscene3dViewport:failed', (_event: Electron.IpcRendererEvent, failure: unknown) => {
		if (!failure || typeof failure !== 'object') {
			return;
		}
		const candidate = failure as Partial<IJScene3DViewportFailure>;
		if (!validPaneId(candidate.paneId) || typeof candidate.message !== 'string' || candidate.message.length === 0) {
			return;
		}
		const registration = jscene3dPanes.get(candidate.paneId);
		if (!registration || (candidate.session && !sameSession(registration.session, candidate.session))) {
			return;
		}
		registration.onFailure(candidate as IJScene3DViewportFailure);
		registration.session = undefined;
	});

	const jscene3dViewport: IJScene3DViewportBridge = {
		registerPane(paneId, onFrame, onFailure): void {
			if (!validPaneId(paneId) || typeof onFrame !== 'function' || typeof onFailure !== 'function' || jscene3dPanes.has(paneId)) {
				throw new Error('Invalid or duplicate JScene3D native viewport pane registration');
			}
			jscene3dPanes.set(paneId, { onFrame, onFailure, surfaceGeneration: 0, frameNumber: 0 });
		},

		unregisterPane(paneId): void {
			if (validPaneId(paneId)) {
				jscene3dPanes.delete(paneId);
			}
		},

		async start(paneId, launch, width, height): Promise<IJScene3DViewportSessionIdentity> {
			const registration = jscene3dPanes.get(paneId);
			if (!registration || !validLaunch(launch) || !validDimension(width) || !validDimension(height)) {
				throw new Error('Invalid JScene3D native viewport start request');
			}
			const session = await ipcRenderer.invoke('vscode:jscene3dViewport:start', paneId, launch, width, height);
			if (!validSession(session)) {
				throw new Error('Invalid JScene3D native viewport session identity');
			}
			registration.session = session;
			registration.surfaceGeneration = 0;
			registration.frameNumber = 0;
			return session;
		},

		updateSceneView(paneId, session, snapshot): void {
			if (sameSession(jscene3dPanes.get(paneId)?.session, session) && validSceneViewSnapshot(snapshot)) {
				ipcRenderer.send('vscode:jscene3dViewport:updateSceneView', paneId, session, snapshot);
			}
		},

		resize(paneId, session, width, height): void {
			if (sameSession(jscene3dPanes.get(paneId)?.session, session) && validDimension(width) && validDimension(height)) {
				ipcRenderer.send('vscode:jscene3dViewport:resize', paneId, session, width, height);
			}
		},

		pause(paneId, session): void {
			if (sameSession(jscene3dPanes.get(paneId)?.session, session)) {
				ipcRenderer.send('vscode:jscene3dViewport:pause', paneId, session);
			}
		},

		resume(paneId, session): void {
			if (sameSession(jscene3dPanes.get(paneId)?.session, session)) {
				ipcRenderer.send('vscode:jscene3dViewport:resume', paneId, session);
			}
		},

		async stop(paneId, session): Promise<void> {
			const registration = jscene3dPanes.get(paneId);
			if (!registration || (session && !sameSession(registration.session, session))) {
				return;
			}
			registration.session = undefined;
			registration.surfaceGeneration = 0;
			registration.frameNumber = 0;
			await ipcRenderer.invoke('vscode:jscene3dViewport:stop', paneId, session);
		}
	};

	// #######################################################################
	// ###                                                                 ###
	// ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
	// ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
	// ###       (https://github.com/electron/electron/issues/25516)       ###
	// ###                                                                 ###
	// #######################################################################

	const globals = {
		jscene3dViewport,

		/**
		 * A minimal set of methods exposed from Electron's `ipcRenderer`
		 * to support communication to main process.
		 */

		ipcRenderer: {

			send(channel: string, ...args: unknown[]): void {
				if (validateIPC(channel)) {
					ipcRenderer.send(channel, ...args);
				}
			},

			invoke(channel: string, ...args: unknown[]): Promise<unknown> {
				validateIPC(channel);

				return ipcRenderer.invoke(channel, ...args);
			},

			on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) {
				validateIPC(channel);

				ipcRenderer.on(channel, listener);

				return this;
			},

			once(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) {
				validateIPC(channel);

				ipcRenderer.once(channel, listener);

				return this;
			},

			removeListener(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) {
				validateIPC(channel);

				ipcRenderer.removeListener(channel, listener);

				return this;
			}
		},

		ipcMessagePort: {

			acquire(responseChannel: string, nonce: string) {
				if (validateIPC(responseChannel)) {
					const responseListener = (e: Electron.IpcRendererEvent, response: string | { nonce: string; error?: string; fatal?: boolean }) => {
						// validate that the nonce from the response is the same
						// as when requested. and if so, use `postMessage` to
						// send the `MessagePort` safely over, even when context
						// isolation is enabled
						const responseNonce = typeof response === 'string' ? response : response.nonce;
						if (nonce === responseNonce) {
							ipcRenderer.off(responseChannel, responseListener);
							window.postMessage(response, '*', e.ports);
						}
					};

					// handle reply from main
					ipcRenderer.on(responseChannel, responseListener);
				}
			}
		},

		/**
		 * Support for subset of methods of Electron's `webFrame` type.
		 */
		webFrame: {

			setZoomLevel(level: number): void {
				if (typeof level === 'number') {
					webFrame.setZoomLevel(level);
				}
			}
		},

		/**
		 * Support for subset of Electron's `webUtils` type.
		 */
		webUtils: {

			getPathForFile(file: File): string {
				return webUtils.getPathForFile(file);
			}
		},

		/**
		 * Support for a subset of access to node.js global `process`.
		 *
		 * Note: when `sandbox` is enabled, the only properties available
		 * are https://github.com/electron/electron/blob/master/docs/api/process.md#sandbox
		 */
		process: {
			get platform() { return process.platform; },
			get arch() { return process.arch; },
			get env() { return { ...process.env }; },
			get versions() { return process.versions; },
			get type() { return 'renderer'; },
			get execPath() { return process.execPath; },

			cwd(): string {
				return process.env['VSCODE_CWD'] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === 'win32' ? '\\' : '/'));
			},

			shellEnv(): Promise<typeof process.env> {
				return resolveShellEnv;
			},

			getProcessMemoryInfo(): Promise<Electron.ProcessMemoryInfo> {
				return process.getProcessMemoryInfo();
			},

			on(type: string, callback: (...args: unknown[]) => void): void {
				process.on(type, callback);
			}
		},

		/**
		 * Some information about the context we are running in.
		 */
		context: {

			/**
			 * A configuration object made accessible from the main side
			 * to configure the sandbox browser window.
			 *
			 * Note: intentionally not using a getter here because the
			 * actual value will be set after `resolveConfiguration`
			 * has finished.
			 */
			configuration(): ISandboxConfiguration | undefined {
				return configuration;
			},

			/**
			 * Allows to await the resolution of the configuration object.
			 */
			async resolveConfiguration(): Promise<ISandboxConfiguration> {
				return resolveConfiguration;
			}
		}
	};

	try {
		// Use `contextBridge` APIs to expose globals to VSCode
		contextBridge.exposeInMainWorld('vscode', globals);
	} catch (error) {
		console.error(error);
	}
}());
