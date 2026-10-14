/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonValue } from './messageTransport';
import { ProjectDiagnosticDto, validateProjectDiagnostic } from './authoringProjectProtocol';
import { validateSceneViewCamera, SceneViewCameraDto } from './authoringSceneViewCameraProtocol';
import { validateSceneViewComponentIdentity, validateSceneViewOccurrence, SceneViewComponentIdentityDto, SceneViewOccurrenceDto } from './authoringSceneViewIdentityProtocol';
import { nullableInteger, nullableString, requiredArray, requiredBoolean, requiredDecimal, requiredInteger, requiredNonEmptyString, requiredObject, requiredReferenceKind, requiredString } from './authoringProtocolValidation';

export { validateSceneViewCamera, SceneViewCameraDto } from './authoringSceneViewCameraProtocol';
export { validateSceneViewComponentIdentity, validateSceneViewOccurrence, SceneViewComponentIdentityDto, SceneViewOccurrenceDto, SceneViewScopeDto } from './authoringSceneViewIdentityProtocol';

/** Exact decimal three-component vector on the authoring wire. */
export interface SceneViewVector3Dto {
	readonly x: string;
	readonly y: string;
	readonly z: string;
}

/** Unrealized renderer-resource reference on the authoring wire. */
export interface SceneViewResourceReferenceDto {
	readonly kind: 'project' | 'asset' | 'import';
	readonly locator: string;
	readonly projectPath: string | null;
}

/** Complete built-in visual state for one expanded Scene occurrence. */
export interface SceneViewVisualOccurrenceDto {
	readonly occurrence: SceneViewOccurrenceDto;
	readonly parent: SceneViewOccurrenceDto | null;
	readonly authoredAssetId: string;
	readonly authoredSource: string;
	readonly authoredEntityId: string;
	readonly name: string | null;
	readonly enabled: boolean;
	readonly transform: {
		readonly identity: SceneViewComponentIdentityDto;
		readonly position: SceneViewVector3Dto;
		readonly orientationDegrees: SceneViewVector3Dto;
		readonly scale: SceneViewVector3Dto;
	} | null;
	readonly meshes: readonly {
		readonly identity: SceneViewComponentIdentityDto;
		readonly mesh: SceneViewResourceReferenceDto;
		readonly material: SceneViewResourceReferenceDto;
		readonly visible: boolean;
	}[];
	readonly directionalLight: {
		readonly identity: SceneViewComponentIdentityDto;
		readonly color: SceneViewVector3Dto;
		readonly intensity: string;
		readonly target: SceneViewVector3Dto;
	} | null;
	readonly cameras: readonly SceneViewCameraDto[];
}

/** Complete Java-owned safe projection for one authored Scene revision. */
export interface SceneViewSnapshotDto {
	readonly sceneAssetId: string;
	readonly revision: number;
	readonly occurrences: readonly SceneViewVisualOccurrenceDto[];
}

/** Product-owned renderer context containing no title runtime artifacts. */
export interface SceneViewLaunchSpecificationDto {
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly sceneName: string;
}

/** Exact revision-scoped outcome returned by `sceneView/read`. */
export type SceneViewReadResultDto =
	| {
		readonly accepted: true;
		readonly projectGeneration: number;
		readonly sceneAssetId: string;
		readonly requestedRevision: number;
		readonly outcome: 'projected' | 'scene-unavailable' | 'stale-revision' | 'planning-failed' | 'projection-failed';
		readonly currentRevision: number | null;
		readonly snapshot: SceneViewSnapshotDto | null;
		readonly launch: SceneViewLaunchSpecificationDto | null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly accepted: false;
		readonly projectGeneration: null;
		readonly sceneAssetId: string;
		readonly requestedRevision: number;
		readonly outcome: null;
		readonly currentRevision: null;
		readonly snapshot: null;
		readonly launch: null;
		readonly diagnostics: readonly [];
		readonly failureCode: string;
	};

/** Authored literal or Java-owned localizable semantic text. */
export function validateSceneViewReadResult(value: JsonValue): SceneViewReadResultDto {
	const object = requiredObject(value, 'sceneView/read result');
	const accepted = requiredBoolean(object.accepted, 'accepted');
	const projectGeneration = nullableInteger(object.projectGeneration, 'projectGeneration');
	const sceneAssetId = requiredNonEmptyString(object.sceneAssetId, 'sceneAssetId');
	const requestedRevision = requiredInteger(object.requestedRevision, 'requestedRevision');
	const outcome = object.outcome === null ? null : requiredSceneViewOutcome(object.outcome);
	const currentRevision = nullableInteger(object.currentRevision, 'currentRevision');
	const snapshot = object.snapshot === null ? null : validateSceneViewSnapshot(object.snapshot);
	const launch = object.launch === null ? null : validateSceneViewLaunch(object.launch);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	if (!accepted) {
		if (projectGeneration !== null || outcome !== null || currentRevision !== null || snapshot !== null
			|| launch !== null || diagnostics.length !== 0 || failureCode === null) {
			throw new Error('sceneView/read result has an inconsistent rejection shape');
		}
		return { accepted: false, projectGeneration: null, sceneAssetId, requestedRevision, outcome: null,
			currentRevision: null, snapshot: null, launch: null, diagnostics: [], failureCode };
	}
	if (projectGeneration === null || outcome === null || failureCode !== null) {
		throw new Error('sceneView/read result has an inconsistent accepted shape');
	}
	const projected = outcome === 'projected';
	if (projected !== (snapshot !== null && launch !== null)
		|| (snapshot !== null && (snapshot.sceneAssetId !== sceneAssetId || snapshot.revision !== currentRevision))) {
		throw new Error('sceneView/read projected result has an inconsistent identity');
	}
	return { accepted: true, projectGeneration, sceneAssetId, requestedRevision, outcome, currentRevision,
		snapshot, launch, diagnostics, failureCode: null };
}

export function validateSceneViewSnapshot(value: JsonValue | undefined): SceneViewSnapshotDto {
	const object = requiredObject(value, 'Scene View snapshot');
	return {
		sceneAssetId: requiredNonEmptyString(object.sceneAssetId, 'Scene View sceneAssetId'),
		revision: requiredInteger(object.revision, 'Scene View revision'),
		occurrences: requiredArray(object.occurrences, 'Scene View occurrences').map(validateSceneViewVisualOccurrence)
	};
}

export function validateSceneViewVisualOccurrence(value: JsonValue): SceneViewVisualOccurrenceDto {
	const object = requiredObject(value, 'Scene View visual occurrence');
	return {
		occurrence: validateSceneViewOccurrence(object.occurrence),
		parent: object.parent === null ? null : validateSceneViewOccurrence(object.parent),
		authoredAssetId: requiredNonEmptyString(object.authoredAssetId, 'authoredAssetId'),
		authoredSource: requiredNonEmptyString(object.authoredSource, 'authoredSource'),
		authoredEntityId: requiredNonEmptyString(object.authoredEntityId, 'authoredEntityId'),
		name: nullableString(object.name, 'name'),
		enabled: requiredBoolean(object.enabled, 'enabled'),
		transform: object.transform === null ? null : validateSceneViewTransform(object.transform),
		meshes: requiredArray(object.meshes, 'meshes').map(validateSceneViewMesh),
		directionalLight: object.directionalLight === null ? null : validateSceneViewDirectionalLight(object.directionalLight),
		cameras: requiredArray(object.cameras, 'cameras').map(validateSceneViewCamera)
	};
}

export function validateSceneViewVector(value: JsonValue | undefined): SceneViewVector3Dto {
	const object = requiredObject(value, 'Scene View vector');
	return {
		x: requiredDecimal(object.x, 'x'),
		y: requiredDecimal(object.y, 'y'),
		z: requiredDecimal(object.z, 'z')
	};
}

export function validateSceneViewTransform(value: JsonValue | undefined): NonNullable<SceneViewVisualOccurrenceDto['transform']> {
	const object = requiredObject(value, 'Scene View transform');
	return {
		identity: validateSceneViewComponentIdentity(object.identity),
		position: validateSceneViewVector(object.position),
		orientationDegrees: validateSceneViewVector(object.orientationDegrees),
		scale: validateSceneViewVector(object.scale)
	};
}

export function validateSceneViewResource(value: JsonValue | undefined): SceneViewResourceReferenceDto {
	const object = requiredObject(value, 'Scene View resource');
	const kind = requiredReferenceKind(object.kind);
	const projectPath = nullableString(object.projectPath, 'projectPath');
	if ((kind === 'project') !== (projectPath !== null)) {
		throw new Error('Scene View project resource path is inconsistent');
	}
	return { kind, locator: requiredNonEmptyString(object.locator, 'locator'), projectPath };
}

export function validateSceneViewMesh(value: JsonValue): SceneViewVisualOccurrenceDto['meshes'][number] {
	const object = requiredObject(value, 'Scene View mesh');
	return {
		identity: validateSceneViewComponentIdentity(object.identity),
		mesh: validateSceneViewResource(object.mesh),
		material: validateSceneViewResource(object.material),
		visible: requiredBoolean(object.visible, 'visible')
	};
}

export function validateSceneViewDirectionalLight(value: JsonValue | undefined): NonNullable<SceneViewVisualOccurrenceDto['directionalLight']> {
	const object = requiredObject(value, 'Scene View directional light');
	return {
		identity: validateSceneViewComponentIdentity(object.identity),
		color: validateSceneViewVector(object.color),
		intensity: requiredDecimal(object.intensity, 'intensity'),
		target: validateSceneViewVector(object.target)
	};
}

export function validateSceneViewLaunch(value: JsonValue | undefined): SceneViewLaunchSpecificationDto {
	const object = requiredObject(value, 'Scene View launch');
	return {
		projectId: requiredNonEmptyString(object.projectId, 'projectId'),
		projectName: requiredNonEmptyString(object.projectName, 'projectName'),
		projectRoot: requiredNonEmptyString(object.projectRoot, 'projectRoot'),
		publishedContentRoot: requiredNonEmptyString(object.publishedContentRoot, 'publishedContentRoot'),
		engineVersion: requiredNonEmptyString(object.engineVersion, 'engineVersion'),
		sceneName: requiredNonEmptyString(object.sceneName, 'sceneName')
	};
}

export function requiredSceneViewOutcome(value: JsonValue | undefined): NonNullable<Extract<SceneViewReadResultDto, { accepted: true }>['outcome']> {
	const outcome = requiredString(value, 'Scene View outcome');
	if (outcome !== 'projected' && outcome !== 'scene-unavailable' && outcome !== 'stale-revision'
		&& outcome !== 'planning-failed' && outcome !== 'projection-failed') {
		throw new Error('Scene View outcome is invalid');
	}
	return outcome;
}

/** Validates a complete generation-scoped retained-definition snapshot. */

