/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJScene3DGameViewportLaunch, IJScene3DSceneViewportLaunch, IJScene3DSceneViewNavigation, IJScene3DTransformPointer, IJScene3DTransformSettings, IJScene3DViewportCameraState, IJScene3DViewportFrameIdentity, IJScene3DViewportLaunch, IJScene3DViewportSessionIdentity, IJScene3DViewportTransform } from './jscene3dViewportProtocol.js';
import { isSceneViewSnapshot } from './jscene3dViewportSceneSnapshotCodec.js';
import { isNonEmptyString } from './jscene3dViewportValidation.js';

export { isSceneViewOccurrence, isSceneViewSelectableOccurrence, isSceneViewSnapshot } from './jscene3dViewportSceneSnapshotCodec.js';

export function isViewportPaneId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function isViewportDimension(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 16384;
}

/** Returns whether a value is a bounded Scene View editor-camera operation. */
export function isSceneViewNavigation(value: unknown): value is IJScene3DSceneViewNavigation {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewNavigation> & Record<string, unknown>;
	switch (candidate.kind) {
		case 'orbit':
		case 'pan':
		case 'gizmoClick':
			return finite(candidate.horizontal) && finite(candidate.vertical)
				&& isViewportDimension(candidate.viewportWidth) && isViewportDimension(candidate.viewportHeight);
		case 'zoom':
			return finite(candidate.amount);
		case 'focusSelected':
		case 'frameAll':
		case 'toggleProjection':
			return true;
		default:
			return false;
	}
}

/** Serializes a validated editor-camera operation into the renderer's protocol-1.0 vocabulary. */
export function sceneViewNavigationCommand(navigation: IJScene3DSceneViewNavigation): string {
	switch (navigation.kind) {
		case 'orbit':
			return `SCENE_NAVIGATE ORBIT ${navigation.horizontal} ${navigation.vertical} ${navigation.viewportWidth} ${navigation.viewportHeight}`;
		case 'pan':
			return `SCENE_NAVIGATE PAN ${navigation.horizontal} ${navigation.vertical} ${navigation.viewportWidth} ${navigation.viewportHeight}`;
		case 'zoom':
			return `SCENE_NAVIGATE ZOOM ${navigation.amount}`;
		case 'gizmoClick':
			return `SCENE_NAVIGATE GIZMO_CLICK ${navigation.horizontal} ${navigation.vertical} ${navigation.viewportWidth} ${navigation.viewportHeight}`;
		case 'focusSelected':
			return 'SCENE_NAVIGATE FOCUS_SELECTED';
		case 'frameAll':
			return 'SCENE_NAVIGATE FRAME_ALL';
		case 'toggleProjection':
			return 'SCENE_NAVIGATE TOGGLE_PROJECTION';
	}
}

export function isSceneTransformSettings(value: unknown): value is IJScene3DTransformSettings {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DTransformSettings>;
	return (candidate.tool === 'select' || candidate.tool === 'move' || candidate.tool === 'rotate' || candidate.tool === 'scale')
		&& (candidate.space === 'global' || candidate.space === 'local')
		&& typeof candidate.snapping === 'boolean'
		&& positive(candidate.translationSnap) && positive(candidate.rotationSnap) && positive(candidate.scaleSnap);
}

export function sceneTransformConfigCommand(settings: IJScene3DTransformSettings): string {
	return `SCENE_TRANSFORM_CONFIG ${settings.tool.toUpperCase()} ${settings.space.toUpperCase()} ${settings.snapping ? 'ON' : 'OFF'} ${settings.translationSnap} ${settings.rotationSnap} ${settings.scaleSnap}`;
}

export function isSceneTransformPointer(value: unknown): value is IJScene3DTransformPointer {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DTransformPointer>;
	return (candidate.phase === 'hover' || candidate.phase === 'begin' || candidate.phase === 'update' || candidate.phase === 'commit' || candidate.phase === 'cancel')
		&& finite(candidate.horizontal) && finite(candidate.vertical)
		&& isViewportDimension(candidate.viewportWidth) && isViewportDimension(candidate.viewportHeight);
}

export function isViewportTransform(value: unknown): value is IJScene3DViewportTransform {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportTransform>;
	return isViewportPaneId(candidate.paneId)
		&& Number.isInteger(candidate.sessionId) && candidate.sessionId! > 0
		&& Number.isInteger(candidate.rendererGeneration) && candidate.rendererGeneration! > 0
		&& (candidate.phase === 'begin' || candidate.phase === 'update' || candidate.phase === 'commit' || candidate.phase === 'cancel' || candidate.phase === 'blocked')
		&& isNonEmptyString(candidate.editId) && candidate.editId!.length <= 128
		&& Number.isInteger(candidate.revision) && candidate.revision! >= 0
		&& isNonEmptyString(candidate.definitionAssetId)
		&& Array.isArray(candidate.entityPath) && candidate.entityPath.length > 0 && candidate.entityPath.every(isNonEmptyString)
		&& isNonEmptyString(candidate.authoredDefinitionAssetId) && isNonEmptyString(candidate.authoredEntityId) && isNonEmptyString(candidate.componentId)
		&& (candidate.propertyId === 'position' || candidate.propertyId === 'orientation' || candidate.propertyId === 'scale')
		&& Array.isArray(candidate.literals) && candidate.literals.length === 3 && candidate.literals.every(isNonEmptyString);
}

/** Returns whether a value is finite renderer-authoritative camera state for one viewport session. */
export function isViewportCameraState(value: unknown): value is IJScene3DViewportCameraState {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportCameraState>;
	return isViewportPaneId(candidate.paneId)
		&& Number.isInteger(candidate.sessionId) && candidate.sessionId! > 0
		&& Number.isInteger(candidate.rendererGeneration) && candidate.rendererGeneration! > 0
		&& finiteVector(candidate.position)
		&& finiteVector(candidate.orientationDegrees)
		&& finiteVector(candidate.pivot)
		&& (candidate.projection === 'perspective' || candidate.projection === 'orthographic');
}

export function sceneTransformPointerCommand(pointer: IJScene3DTransformPointer, selectionRequest: number | undefined, revision: number): string {
	return `SCENE_TRANSFORM_POINTER ${pointer.phase.toUpperCase()} ${pointer.horizontal} ${pointer.vertical} ${pointer.viewportWidth} ${pointer.viewportHeight} ${selectionRequest ?? 'NONE'} ${revision}`;
}

function finite(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function finiteVector(value: unknown): value is readonly [number, number, number] {
	return Array.isArray(value) && value.length === 3 && value.every(finite);
}

function positive(value: unknown): value is number {
	return finite(value) && value > 0;
}

export function isViewportLaunch(value: unknown): value is IJScene3DViewportLaunch {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportLaunch>;
	return isViewportPaneId(candidate.viewportId)
		&& isNonEmptyString(candidate.connectionGeneration)
		&& Number.isInteger(candidate.projectGeneration) && candidate.projectGeneration! > 0
		&& isNonEmptyString(candidate.projectId)
		&& isNonEmptyString(candidate.projectName)
		&& isNonEmptyString(candidate.projectRoot)
		&& isNonEmptyString(candidate.publishedContentRoot)
		&& isNonEmptyString(candidate.engineVersion)
		&& isNonEmptyString(candidate.sceneAssetId)
		&& isNonEmptyString(candidate.sceneName)
		&& (isGameLaunch(candidate) || isSceneLaunch(candidate));
}

function isGameLaunch(candidate: Partial<IJScene3DViewportLaunch>): candidate is IJScene3DGameViewportLaunch {
	return candidate.kind === 'game'
		&& Array.isArray(candidate.runtimeArtifacts)
		&& candidate.runtimeArtifacts.every(isNonEmptyString);
}

function isSceneLaunch(candidate: Partial<IJScene3DViewportLaunch>): candidate is IJScene3DSceneViewportLaunch {
	return candidate.kind === 'scene'
		&& !('runtimeArtifacts' in candidate)
		&& isSceneViewSnapshot(candidate.snapshot)
		&& candidate.snapshot.sceneAssetId === candidate.sceneAssetId;
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
		&& Number.isInteger(candidate.presentationGeneration) && candidate.presentationGeneration! >= 0
		&& Number.isInteger(candidate.surfaceGeneration) && candidate.surfaceGeneration! > 0
		&& Number.isInteger(candidate.frameNumber) && candidate.frameNumber! > 0;
}


