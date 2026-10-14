/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJScene3DSceneViewCamera, IJScene3DSceneViewComponentIdentity, IJScene3DSceneViewOccurrence, IJScene3DSceneViewResourceReference, IJScene3DSceneViewSnapshot, IJScene3DSceneViewVector3, IJScene3DSceneViewVisualOccurrence } from './jscene3dViewportProtocol.js';
import { isFiniteDecimalString, isNonEmptyString } from './jscene3dViewportValidation.js';

/** Returns whether an IPC value is a complete runtime-free Scene View snapshot. */
export function isSceneViewSnapshot(value: unknown): value is IJScene3DSceneViewSnapshot {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewSnapshot>;
	return isNonEmptyString(candidate.sceneAssetId)
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
		&& isNonEmptyString(candidate.authoredAssetId)
		&& isNonEmptyString(candidate.authoredSource)
		&& isNonEmptyString(candidate.authoredEntityId)
		&& (candidate.name === null || typeof candidate.name === 'string')
		&& typeof candidate.enabled === 'boolean'
		&& (candidate.transform === null || isSceneViewTransform(candidate.transform))
		&& Array.isArray(candidate.meshes) && candidate.meshes.every(isSceneViewMesh)
		&& (candidate.directionalLight === null || isSceneViewDirectionalLight(candidate.directionalLight))
		&& Array.isArray(candidate.cameras) && candidate.cameras.every(isSceneViewCamera);
}

export function isSceneViewOccurrence(value: unknown): value is IJScene3DSceneViewOccurrence {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewOccurrence>;
	return isNonEmptyString(candidate.rootDefinitionAssetId)
		&& Array.isArray(candidate.entityPath) && candidate.entityPath.every(isNonEmptyString);
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
		&& isNonEmptyString(candidate.scope.definitionAssetId)
		&& isSceneViewOccurrence(candidate.scope.anchor)
		&& isNonEmptyString(candidate.authoredEntityId)
		&& isNonEmptyString(candidate.componentId);
}

function isSceneViewVector3(value: unknown): value is IJScene3DSceneViewVector3 {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewVector3>;
	return isFiniteDecimalString(candidate.x) && isFiniteDecimalString(candidate.y) && isFiniteDecimalString(candidate.z);
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
		&& isNonEmptyString(candidate.locator)
		&& (candidate.kind === 'project' ? isNonEmptyString(candidate.projectPath) : candidate.projectPath === null);
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
		&& isFiniteDecimalString(candidate.intensity)
		&& isSceneViewVector3(candidate.target);
}

function isSceneViewCamera(value: unknown): value is IJScene3DSceneViewCamera {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DSceneViewCamera> & Record<string, unknown>;
	if (!isSceneViewComponentIdentity(candidate.identity) || typeof candidate.primary !== 'boolean') {
		return false;
	}
	if (candidate.kind === 'perspective') {
		return isFiniteDecimalString(candidate.fieldOfViewDegrees)
			&& decimalNumber(candidate.fieldOfViewDegrees) > 0
			&& decimalNumber(candidate.fieldOfViewDegrees) < 180
			&& isFiniteDecimalString(candidate.near) && decimalNumber(candidate.near) > 0
			&& isFiniteDecimalString(candidate.far) && decimalNumber(candidate.far) > decimalNumber(candidate.near);
	}
	if (candidate.kind === 'orthographic') {
		return isFiniteDecimalString(candidate.left) && isFiniteDecimalString(candidate.right)
			&& decimalNumber(candidate.left) < decimalNumber(candidate.right)
			&& isFiniteDecimalString(candidate.top) && isFiniteDecimalString(candidate.bottom)
			&& decimalNumber(candidate.bottom) < decimalNumber(candidate.top)
			&& isFiniteDecimalString(candidate.near) && decimalNumber(candidate.near) >= 0
			&& isFiniteDecimalString(candidate.far) && decimalNumber(candidate.far) > decimalNumber(candidate.near)
			&& isFiniteDecimalString(candidate.zoom) && decimalNumber(candidate.zoom) > 0;
	}
	return false;
}

function decimalNumber(value: string): number {
	return Number(value);
}
