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
		onSelection: (selection: IJScene3DViewportSelection) => void
	): void;
	unregisterPane(paneId: string): void;
	start(paneId: string, launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DViewportSessionIdentity>;
	updateSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, snapshot: IJScene3DSceneViewSnapshot): void;
	selectSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, occurrence: IJScene3DSceneViewOccurrence | null): void;
	pickSceneView(paneId: string, session: IJScene3DViewportSessionIdentity, revision: number, horizontal: number, vertical: number): void;
	resize(paneId: string, session: IJScene3DViewportSessionIdentity, width: number, height: number): void;
	pause(paneId: string, session: IJScene3DViewportSessionIdentity): void;
	resume(paneId: string, session: IJScene3DViewportSessionIdentity): void;
	stop(paneId: string, session?: IJScene3DViewportSessionIdentity): Promise<void>;
}

export interface IJScene3DViewportFrameConsumer<T> {
	readonly onFrame: (frame: T, identity: IJScene3DViewportFrameIdentity) => Promise<void>;
	readonly onFailure: (failure: IJScene3DViewportFailure) => void;
}

interface IJScene3DViewportFrameRegistration<T> {
	readonly consumer: IJScene3DViewportFrameConsumer<T>;
	session?: IJScene3DViewportSessionIdentity;
	surfaceGeneration: number;
	frameNumber: number;
}

export function isViewportPaneId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function isViewportDimension(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 16384;
}

export function isViewportLaunch(value: unknown): value is IJScene3DViewportLaunch {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportLaunch>;
	return isViewportPaneId(candidate.viewportId)
		&& nonEmpty(candidate.connectionGeneration)
		&& Number.isInteger(candidate.projectGeneration) && candidate.projectGeneration! > 0
		&& nonEmpty(candidate.projectId)
		&& nonEmpty(candidate.projectName)
		&& nonEmpty(candidate.projectRoot)
		&& nonEmpty(candidate.publishedContentRoot)
		&& nonEmpty(candidate.engineVersion)
		&& nonEmpty(candidate.sceneAssetId)
		&& nonEmpty(candidate.sceneName)
		&& (isGameLaunch(candidate) || isSceneLaunch(candidate));
}

function isGameLaunch(candidate: Partial<IJScene3DViewportLaunch>): candidate is IJScene3DGameViewportLaunch {
	return candidate.kind === 'game'
		&& Array.isArray(candidate.runtimeArtifacts)
		&& candidate.runtimeArtifacts.every(nonEmpty);
}

function isSceneLaunch(candidate: Partial<IJScene3DViewportLaunch>): candidate is IJScene3DSceneViewportLaunch {
	return candidate.kind === 'scene'
		&& !('runtimeArtifacts' in candidate)
		&& isSceneViewSnapshot(candidate.snapshot)
		&& candidate.snapshot.sceneAssetId === candidate.sceneAssetId;
}

/** Returns whether an IPC value is a complete runtime-free Scene View snapshot. */
export function isSceneViewSnapshot(value: unknown): value is IJScene3DSceneViewSnapshot {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewSnapshot>;
	return nonEmpty(candidate.sceneAssetId)
		&& Number.isInteger(candidate.revision) && candidate.revision! >= 0
		&& Array.isArray(candidate.occurrences)
		&& candidate.occurrences.every(isSceneViewVisualOccurrence);
}

function isSceneViewVisualOccurrence(value: unknown): value is IJScene3DSceneViewVisualOccurrence {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewVisualOccurrence>;
	return isSceneViewOccurrence(candidate.occurrence)
		&& (candidate.parent === null || isSceneViewOccurrence(candidate.parent))
		&& nonEmpty(candidate.authoredAssetId)
		&& nonEmpty(candidate.authoredSource)
		&& nonEmpty(candidate.authoredEntityId)
		&& (candidate.name === null || typeof candidate.name === 'string')
		&& typeof candidate.enabled === 'boolean'
		&& (candidate.transform === null || isSceneViewTransform(candidate.transform))
		&& Array.isArray(candidate.meshes) && candidate.meshes.every(isSceneViewMesh)
		&& (candidate.directionalLight === null || isSceneViewDirectionalLight(candidate.directionalLight));
}

export function isSceneViewOccurrence(value: unknown): value is IJScene3DSceneViewOccurrence {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewOccurrence>;
	return nonEmpty(candidate.rootDefinitionAssetId)
		&& Array.isArray(candidate.entityPath) && candidate.entityPath.every(nonEmpty);
}

/** Returns whether an occurrence identifies a selectable authored entity rather than the Scene root. */
export function isSceneViewSelectableOccurrence(value: unknown): value is IJScene3DSceneViewOccurrence {
	return isSceneViewOccurrence(value) && value.entityPath.length > 0;
}

function isSceneViewComponentIdentity(value: unknown): value is IJScene3DSceneViewComponentIdentity {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewComponentIdentity>;
	return isSceneViewOccurrence(candidate.occurrence)
		&& !!candidate.scope && typeof candidate.scope === 'object'
		&& nonEmpty(candidate.scope.definitionAssetId)
		&& isSceneViewOccurrence(candidate.scope.anchor)
		&& nonEmpty(candidate.authoredEntityId)
		&& nonEmpty(candidate.componentId);
}

function isSceneViewVector3(value: unknown): value is IJScene3DSceneViewVector3 {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewVector3>;
	return decimal(candidate.x) && decimal(candidate.y) && decimal(candidate.z);
}

function isSceneViewTransform(value: unknown): boolean {
	const candidate = value as IJScene3DSceneViewVisualOccurrence['transform'];
	return !!candidate && isSceneViewComponentIdentity(candidate.identity)
		&& isSceneViewVector3(candidate.position)
		&& isSceneViewVector3(candidate.orientationDegrees)
		&& isSceneViewVector3(candidate.scale);
}

function isSceneViewResource(value: unknown): value is IJScene3DSceneViewResourceReference {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewResourceReference>;
	return (candidate.kind === 'project' || candidate.kind === 'asset' || candidate.kind === 'import')
		&& nonEmpty(candidate.locator)
		&& (candidate.kind === 'project' ? nonEmpty(candidate.projectPath) : candidate.projectPath === null);
}

function isSceneViewMesh(value: unknown): boolean {
	const candidate = value as IJScene3DSceneViewVisualOccurrence['meshes'][number];
	return !!candidate && isSceneViewComponentIdentity(candidate.identity)
		&& isSceneViewResource(candidate.mesh)
		&& isSceneViewResource(candidate.material)
		&& typeof candidate.visible === 'boolean';
}

function isSceneViewDirectionalLight(value: unknown): boolean {
	const candidate = value as NonNullable<IJScene3DSceneViewVisualOccurrence['directionalLight']>;
	return !!candidate && isSceneViewComponentIdentity(candidate.identity)
		&& isSceneViewVector3(candidate.color)
		&& decimal(candidate.intensity)
		&& isSceneViewVector3(candidate.target);
}

function decimal(value: unknown): value is string {
	return typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function nonEmpty(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export function isViewportSessionIdentity(value: unknown): value is IJScene3DViewportSessionIdentity {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportSessionIdentity>;
	return Number.isInteger(candidate.sessionId) && candidate.sessionId! > 0
		&& Number.isInteger(candidate.rendererGeneration) && candidate.rendererGeneration! > 0;
}

export function isViewportFrameIdentity(value: unknown): value is IJScene3DViewportFrameIdentity {
	if (!isViewportSessionIdentity(value)) {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportFrameIdentity>;
	return isViewportPaneId(candidate.paneId)
		&& Number.isInteger(candidate.surfaceGeneration) && candidate.surfaceGeneration! > 0
		&& Number.isInteger(candidate.frameNumber) && candidate.frameNumber! > 0;
}

/** Starts every owned viewport stop before waiting for asynchronous renderer cleanup. */
export async function stopViewportSessions<T>(sessions: Iterable<T>, stop: (session: T) => Promise<void>): Promise<void> {
	await Promise.all(Array.from(sessions, session => stop(session)));
}

/** Routes native frames only to the pane and renderer session that registered for them. */
export class JScene3DViewportFrameRouter<T> {
	private readonly registrations = new Map<string, IJScene3DViewportFrameRegistration<T>>();

	register(paneId: string, consumer: IJScene3DViewportFrameConsumer<T>): boolean {
		if (!isViewportPaneId(paneId) || this.registrations.has(paneId)) {
			return false;
		}
		this.registrations.set(paneId, { consumer, surfaceGeneration: 0, frameNumber: 0 });
		return true;
	}

	unregister(paneId: string): void {
		this.registrations.delete(paneId);
	}

	bindSession(paneId: string, session: IJScene3DViewportSessionIdentity): boolean {
		const registration = this.registrations.get(paneId);
		if (!registration || !isViewportSessionIdentity(session)) {
			return false;
		}
		registration.session = session;
		registration.surfaceGeneration = 0;
		registration.frameNumber = 0;
		return true;
	}

	unbindSession(paneId: string, session?: IJScene3DViewportSessionIdentity): void {
		const registration = this.registrations.get(paneId);
		if (!registration || (session && !this.matches(registration.session, session))) {
			return;
		}
		registration.session = undefined;
		registration.surfaceGeneration = 0;
		registration.frameNumber = 0;
	}

	async route(frame: T, identity: unknown): Promise<boolean> {
		if (!isViewportFrameIdentity(identity)) {
			return false;
		}
		const registration = this.registrations.get(identity.paneId);
		if (!registration || !this.matches(registration.session, identity)) {
			return false;
		}
		if (identity.surfaceGeneration < registration.surfaceGeneration
			|| (identity.surfaceGeneration === registration.surfaceGeneration && identity.frameNumber <= registration.frameNumber)) {
			return false;
		}
		registration.surfaceGeneration = identity.surfaceGeneration;
		registration.frameNumber = identity.frameNumber;
		await registration.consumer.onFrame(frame, identity);
		return true;
	}

	fail(failure: unknown): boolean {
		if (!failure || typeof failure !== 'object') {
			return false;
		}
		const candidate = failure as Partial<IJScene3DViewportFailure>;
		if (!isViewportPaneId(candidate.paneId) || typeof candidate.message !== 'string' || candidate.message.length === 0) {
			return false;
		}
		const registration = this.registrations.get(candidate.paneId);
		if (!registration || (candidate.session && !this.matches(registration.session, candidate.session))) {
			return false;
		}
		registration.consumer.onFailure(candidate as IJScene3DViewportFailure);
		return true;
	}

	private matches(actual: IJScene3DViewportSessionIdentity | undefined, expected: IJScene3DViewportSessionIdentity): boolean {
		return actual?.sessionId === expected.sessionId && actual.rendererGeneration === expected.rendererGeneration;
	}
}
