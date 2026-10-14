/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonValue } from './messageTransport';
import { requiredNonEmptyString, requiredObject, requiredStringArray } from './authoringProtocolValidation';

export interface SceneViewOccurrenceDto {
	readonly rootDefinitionAssetId: string;
	readonly entityPath: readonly string[];
}

/** Wire definition scope that owns a projected component. */
export interface SceneViewScopeDto {
	readonly definitionAssetId: string;
	readonly anchor: SceneViewOccurrenceDto;
}

/** Wire reverse-lookup identity for one projected built-in component. */
export interface SceneViewComponentIdentityDto {
	readonly occurrence: SceneViewOccurrenceDto;
	readonly scope: SceneViewScopeDto;
	readonly authoredEntityId: string;
	readonly componentId: string;
}

export function validateSceneViewOccurrence(value: JsonValue | undefined): SceneViewOccurrenceDto {
	const object = requiredObject(value, 'Scene View occurrence');
	return {
		rootDefinitionAssetId: requiredNonEmptyString(object.rootDefinitionAssetId, 'rootDefinitionAssetId'),
		entityPath: requiredStringArray(object.entityPath, 'entityPath')
	};
}

export function validateSceneViewComponentIdentity(value: JsonValue | undefined): SceneViewComponentIdentityDto {
	const object = requiredObject(value, 'Scene View component identity');
	const scope = requiredObject(object.scope, 'Scene View scope');
	return {
		occurrence: validateSceneViewOccurrence(object.occurrence),
		scope: {
			definitionAssetId: requiredNonEmptyString(scope.definitionAssetId, 'definitionAssetId'),
			anchor: validateSceneViewOccurrence(scope.anchor)
		},
		authoredEntityId: requiredNonEmptyString(object.authoredEntityId, 'authoredEntityId'),
		componentId: requiredNonEmptyString(object.componentId, 'componentId')
	};
}
