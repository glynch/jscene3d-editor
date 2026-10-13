/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonObject, JsonValue } from './messageTransport';
import { InspectorMutationTargetDto, occurrenceJson } from './authoringDefinitionProtocol';
import { ProjectDiagnosticDto, validateProjectDiagnostic } from './authoringProjectProtocol';
import { nullableString, requiredArray, requiredBoolean, requiredInteger, requiredNonEmptyString, requiredObject, requiredPositiveInteger } from './authoringProtocolValidation';

/** Exact typed candidate accepted by the editable Inspector. */
export type DefinitionMutationValueDto =
	| { readonly kind: 'boolean'; readonly value: boolean }
	| { readonly kind: 'integer' | 'number' | 'text'; readonly literal: string }
	| { readonly kind: 'number-array'; readonly literals: readonly string[] };

/** Permanent authored mutation vocabulary. */
export type DefinitionMutationDto =
	| { readonly operation: 'set'; readonly value: DefinitionMutationValueDto }
	| { readonly operation: 'remove' };

/** Authoritative state returned after mutation, history, persistence, or recovery. */
export interface DefinitionOperationResultDto {
	readonly definition: string;
	readonly outcome: string;
	readonly revision: number;
	readonly dirty: boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly diagnostics: readonly ProjectDiagnosticDto[];
}

/** Authoritative recovery capture with opaque Java-produced bytes. */
export interface DefinitionBackupResultDto {
	readonly definition: string;
	readonly outcome: string;
	readonly revision: number;
	readonly dirty: boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly backup: string | null;
}

/** Serializes one Java-issued mutation target without using labels or JSON pointers. */
export function mutationTargetJson(target: InspectorMutationTargetDto): JsonObject {
	return target.kind === 'entity-enabled'
		? {
			kind: target.kind,
			occurrence: occurrenceJson(target.occurrence),
			entityId: target.entityId,
			componentId: null,
			propertyId: null
		}
		: {
			kind: target.kind,
			occurrence: occurrenceJson(target.occurrence),
			entityId: target.entityId,
			componentId: target.componentId,
			propertyId: target.propertyId
		};
}

/** Serializes one exact typed candidate without converting decimal text to binary numbers. */
export function mutationValueJson(value: DefinitionMutationValueDto): JsonObject {
	switch (value.kind) {
		case 'boolean':
			return { kind: value.kind, value: value.value, literal: null, literals: null };
		case 'number-array':
			return { kind: value.kind, value: null, literal: null, literals: [...value.literals] };
		case 'integer':
		case 'number':
		case 'text':
			return { kind: value.kind, value: null, literal: value.literal, literals: null };
	}
}

/** Serializes one generation- and revision-scoped working-copy operation. */
export function definitionOperationParams(projectGeneration: number, assetId: string, revision: number): JsonObject {
	return {
		expectedProjectGeneration: requiredPositiveInteger(projectGeneration, 'expectedProjectGeneration'),
		assetId: requiredNonEmptyString(assetId, 'assetId'),
		expectedDefinitionRevision: requiredInteger(revision, 'expectedDefinitionRevision')
	};
}

/** Validates authoritative working-copy lifecycle state. */
export function validateDefinitionOperationResult(value: JsonValue): DefinitionOperationResultDto {
	const object = requiredObject(value, 'definition operation result');
	return {
		definition: requiredNonEmptyString(object.definition, 'definition'),
		outcome: requiredNonEmptyString(object.outcome, 'outcome'),
		revision: requiredInteger(object.revision, 'revision'),
		dirty: requiredBoolean(object.dirty, 'dirty'),
		canUndo: requiredBoolean(object.canUndo, 'canUndo'),
		canRedo: requiredBoolean(object.canRedo, 'canRedo'),
		diagnostics: requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic)
	};
}

/** Validates one opaque Java recovery capture. */
export function validateDefinitionBackupResult(value: JsonValue): DefinitionBackupResultDto {
	const object = requiredObject(value, 'definition backup result');
	const result = {
		definition: requiredNonEmptyString(object.definition, 'definition'),
		outcome: requiredNonEmptyString(object.outcome, 'outcome'),
		revision: requiredInteger(object.revision, 'revision'),
		dirty: requiredBoolean(object.dirty, 'dirty'),
		canUndo: requiredBoolean(object.canUndo, 'canUndo'),
		canRedo: requiredBoolean(object.canRedo, 'canRedo'),
		backup: nullableString(object.backup, 'backup')
	};
	if ((result.backup !== null) !== (result.outcome === 'backed-up')) {
		throw new Error('definition backup result has an inconsistent shape');
	}
	return result;
}
