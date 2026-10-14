/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IJScene3DViewportSessionIdentity {
	readonly sessionId: number;
	readonly rendererGeneration: number;
}

export interface IJScene3DViewportFrameIdentity extends IJScene3DViewportSessionIdentity {
	readonly paneId: string;
	readonly presentationGeneration: number;
	readonly surfaceGeneration: number;
	readonly frameNumber: number;
}

export interface IJScene3DViewportFailure {
	readonly paneId: string;
	readonly session?: IJScene3DViewportSessionIdentity;
	readonly message: string;
}

/** Revision-qualified Scene View selection reported by the native renderer. */
export interface IJScene3DViewportSelection extends IJScene3DViewportSessionIdentity {
	readonly paneId: string;
	readonly revision: number;
	readonly occurrence: IJScene3DSceneViewOccurrence | null;
}

export type JScene3DCameraProjection = 'perspective' | 'orthographic';

/** Renderer-authoritative editor-camera state for one exact Scene View session. */
export interface IJScene3DViewportCameraState extends IJScene3DViewportSessionIdentity {
	readonly paneId: string;
	readonly position: readonly [number, number, number];
	readonly orientationDegrees: readonly [number, number, number];
	readonly pivot: readonly [number, number, number];
	readonly projection: JScene3DCameraProjection;
}

export type JScene3DTransformTool = 'select' | 'move' | 'rotate' | 'scale';
export type JScene3DTransformSpace = 'global' | 'local';
export type JScene3DTransformPhase = 'begin' | 'update' | 'commit' | 'cancel' | 'blocked';
export type JScene3DTransformPointerPhase = 'hover' | 'begin' | 'update' | 'commit' | 'cancel';

/** Renderer-authored intent for one authoritative component-property edit transaction. */
export interface IJScene3DViewportTransform extends IJScene3DViewportSessionIdentity {
	readonly paneId: string;
	readonly phase: JScene3DTransformPhase;
	readonly editId: string;
	readonly revision: number;
	readonly definitionAssetId: string;
	readonly entityPath: readonly string[];
	readonly authoredDefinitionAssetId: string;
	readonly authoredEntityId: string;
	readonly componentId: string;
	readonly propertyId: 'position' | 'orientation' | 'scale';
	readonly literals: readonly [string, string, string];
}

export interface IJScene3DTransformSettings {
	readonly tool: JScene3DTransformTool;
	readonly space: JScene3DTransformSpace;
	readonly snapping: boolean;
	readonly translationSnap: number;
	readonly rotationSnap: number;
	readonly scaleSnap: number;
}

export interface IJScene3DTransformPointer {
	readonly phase: JScene3DTransformPointerPhase;
	readonly horizontal: number;
	readonly vertical: number;
	readonly viewportWidth: number;
	readonly viewportHeight: number;
}

/** Validated Scene View editor-camera operation sent to its retained native session. */
export type IJScene3DSceneViewNavigation =
	| { readonly kind: 'orbit' | 'pan'; readonly horizontal: number; readonly vertical: number; readonly viewportWidth: number; readonly viewportHeight: number }
	| { readonly kind: 'zoom'; readonly amount: number }
	| { readonly kind: 'gizmoClick'; readonly horizontal: number; readonly vertical: number; readonly viewportWidth: number; readonly viewportHeight: number }
	| { readonly kind: 'focusSelected' | 'frameAll' | 'toggleProjection' };

/** Selection payload forwarded from an active Scene View to the built-in extension. */
export interface IJScene3DSceneSelectionChange {
	readonly viewportId: string;
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
	readonly sceneAssetId: string;
	readonly revision: number;
	readonly occurrence: IJScene3DSceneViewOccurrence | null;
}

export const JSCENE3D_ACCEPT_SCENE_SELECTION_COMMAND_ID = 'jscene3d.acceptSceneViewSelection';
export const JSCENE3D_ACCEPT_SCENE_TRANSFORM_COMMAND_ID = 'jscene3d.acceptSceneViewTransform';

interface IJScene3DViewportLaunchBase {
	readonly viewportId: string;
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly sceneAssetId: string;
	readonly sceneName: string;
}

/** Java-prepared semantic identity and runtime inputs for one isolated Game View. */
export interface IJScene3DGameViewportLaunch extends IJScene3DViewportLaunchBase {
	readonly kind: 'game';
	readonly runtimeArtifacts: readonly string[];
}

/** Stable identity of one expanded Scene composition occurrence. */
export interface IJScene3DSceneViewOccurrence {
	readonly rootDefinitionAssetId: string;
	readonly entityPath: readonly string[];
}

/** Definition scope that owns a projected component occurrence. */
export interface IJScene3DSceneViewScope {
	readonly definitionAssetId: string;
	readonly anchor: IJScene3DSceneViewOccurrence;
}

/** Stable reverse-lookup identity for one projected built-in component. */
export interface IJScene3DSceneViewComponentIdentity {
	readonly occurrence: IJScene3DSceneViewOccurrence;
	readonly scope: IJScene3DSceneViewScope;
	readonly authoredEntityId: string;
	readonly componentId: string;
}

/** Exact decimal three-component vector. */
export interface IJScene3DSceneViewVector3 {
	readonly x: string;
	readonly y: string;
	readonly z: string;
}

/** Unrealized resource reference safe for transport to the editor renderer. */
export interface IJScene3DSceneViewResourceReference {
	readonly kind: 'project' | 'asset' | 'import';
	readonly locator: string;
	readonly projectPath: string | null;
}

/** Complete built-in visual state for one expanded Scene occurrence. */
export interface IJScene3DSceneViewVisualOccurrence {
	readonly occurrence: IJScene3DSceneViewOccurrence;
	readonly parent: IJScene3DSceneViewOccurrence | null;
	readonly authoredAssetId: string;
	readonly authoredSource: string;
	readonly authoredEntityId: string;
	readonly name: string | null;
	readonly enabled: boolean;
	readonly transform: {
		readonly identity: IJScene3DSceneViewComponentIdentity;
		readonly position: IJScene3DSceneViewVector3;
		readonly orientationDegrees: IJScene3DSceneViewVector3;
		readonly scale: IJScene3DSceneViewVector3;
	} | null;
	readonly meshes: readonly {
		readonly identity: IJScene3DSceneViewComponentIdentity;
		readonly mesh: IJScene3DSceneViewResourceReference;
		readonly material: IJScene3DSceneViewResourceReference;
		readonly visible: boolean;
	}[];
	readonly directionalLight: {
		readonly identity: IJScene3DSceneViewComponentIdentity;
		readonly color: IJScene3DSceneViewVector3;
		readonly intensity: string;
		readonly target: IJScene3DSceneViewVector3;
	} | null;
}

/** Complete Java-projected state for one exact authored Scene revision. */
export interface IJScene3DSceneViewSnapshot {
	readonly sceneAssetId: string;
	readonly revision: number;
	readonly occurrences: readonly IJScene3DSceneViewVisualOccurrence[];
}

/** Runtime-free launch for one safe authored Scene View. */
export interface IJScene3DSceneViewportLaunch extends IJScene3DViewportLaunchBase {
	readonly kind: 'scene';
	readonly snapshot: IJScene3DSceneViewSnapshot;
}

/** Trusted launch contract for either an isolated Game View or runtime-free Scene View. */
export type IJScene3DViewportLaunch = IJScene3DGameViewportLaunch | IJScene3DSceneViewportLaunch;

export interface IJScene3DViewportBridge {
	registerPane(
		paneId: string,
		onReady: (session: IJScene3DViewportSessionIdentity) => void,
		onFrame: (frame: VideoFrame, identity: IJScene3DViewportFrameIdentity) => Promise<void>,
		onFailure: (failure: IJScene3DViewportFailure) => void,
		onSelection: (selection: IJScene3DViewportSelection) => void,
		onTransform: (transform: IJScene3DViewportTransform) => void,
		onCameraState: (cameraState: IJScene3DViewportCameraState) => void
	): void;
	unregisterPane(paneId: string): void;
	start(paneId: string, launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DViewportSessionIdentity>;
	updateSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, snapshot: IJScene3DSceneViewSnapshot): void;
	selectSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, occurrence: IJScene3DSceneViewOccurrence | null): void;
	pickSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, horizontal: number, vertical: number): void;
	navigateSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, navigation: IJScene3DSceneViewNavigation): void;
	configureSceneTransform(paneId: string, session: IJScene3DViewportSessionIdentity, settings: IJScene3DTransformSettings): void;
	transformSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, pointer: IJScene3DTransformPointer): void;
	resize(paneId: string, session: IJScene3DViewportSessionIdentity, width: number, height: number): void;
	pause(paneId: string, session: IJScene3DViewportSessionIdentity): void;
	resume(paneId: string, session: IJScene3DViewportSessionIdentity): void;
	stop(paneId: string, session?: IJScene3DViewportSessionIdentity): Promise<void>;
}

export interface IJScene3DViewportFrameConsumer<T> {
	readonly onFrame: (frame: T, identity: IJScene3DViewportFrameIdentity) => Promise<void>;
	readonly onFailure: (failure: IJScene3DViewportFailure) => void;
}


