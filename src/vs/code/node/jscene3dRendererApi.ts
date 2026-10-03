/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Describes the native renderer process to launch for a viewport. */
export interface IJScene3DRendererLaunchRequest {
	readonly javaExecutable: string;
	readonly workingDirectory: string;
	readonly nativeLibraryDirectory: string;
	readonly classPath: string[];
	readonly mainClass: string;
	readonly rendererArguments: string[];
	readonly width: number;
	readonly height: number;
}

/** Receives native renderer lifecycle and surface notifications. */
export interface IJScene3DRendererObservers {
	readonly onReady?: () => void;
	readonly onFrameReady?: () => void;
	readonly onExit?: () => void;
	readonly onSurfaceReady?: (surfaceGeneration: number, width: number, height: number) => void;
}

/** Identifies a launched native renderer session. */
export interface IJScene3DRendererSession {
	readonly sessionId: number;
	readonly pid: number;
	readonly surfaceGeneration: number;
}

/** Describes the IOSurface currently owned by a native renderer session. */
export interface IJScene3DRendererSurface {
	readonly handle: Buffer;
	readonly width: number;
	readonly height: number;
	readonly surfaceGeneration: number;
}

/** Defines the custom Electron API used to own native renderer sessions. */
export interface IJScene3DRendererApi {
	launchRenderer(request: IJScene3DRendererLaunchRequest, observers?: IJScene3DRendererObservers): IJScene3DRendererSession;
	getSurface(sessionId: number): IJScene3DRendererSurface | null;
	sendRendererMessage(sessionId: number, message: string): boolean;
	replaceSurface(sessionId: number, expectedSurfaceGeneration: number, width: number, height: number): boolean;
	pauseRenderer(sessionId: number): boolean;
	resumeRenderer(sessionId: number): boolean;
	stopRenderer(sessionId: number): Promise<void>;
	stopAllRenderers(): Promise<void>;
}

/** Electron module surface required to initialize the native viewport controller. */
export interface IJScene3DElectronApi {
	readonly jscene3dRenderer?: IJScene3DRendererApi;
}

/** Requires the downstream renderer API before native viewport IPC is registered. */
export function initializeJScene3DRendererApi(electronApi: IJScene3DElectronApi): IJScene3DRendererApi {
	const renderer = electronApi.jscene3dRenderer;
	if (!renderer) {
		throw new Error('The JScene3D renderer API is unavailable in this Electron process');
	}
	return renderer;
}
