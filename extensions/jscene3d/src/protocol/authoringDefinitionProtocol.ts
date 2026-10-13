/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonObject, JsonValue } from './messageTransport';
import { ProjectDiagnosticDto, validateProjectDiagnostic } from './authoringProjectProtocol';
import { nullableInteger, nullableString, requiredArray, requiredBoolean, requiredDecimal, requiredDefinitionOrigin, requiredInteger, requiredNonEmptyString, requiredObject, requiredPositiveInteger, requiredReferenceKind, requiredString, requiredStringArray } from './authoringProtocolValidation';

export interface AuthoringTextDto {
	readonly kind: 'literal' | 'message';
	readonly text: string;
	readonly messageCode: string | null;
	readonly arguments: readonly string[];
}

/** Stable hierarchy occurrence identity within one containing definition. */
export interface HierarchyOccurrenceDto {
	readonly definitionAssetId: string;
	readonly entityPath: readonly string[];
}

/** Semantic target retained for a future Inspector without transferring UI selection to Java. */
export interface HierarchySemanticTargetDto {
	readonly kind: 'scene' | 'local-entity' | 'generated-entity' | 'placement' | 'asset';
	readonly source: string;
	readonly identity: string;
	readonly occurrence: HierarchyOccurrenceDto | null;
}

/** One recursively ordered semantic hierarchy occurrence. */
export interface HierarchyNodeDto {
	readonly occurrence: HierarchyOccurrenceDto;
	readonly kind: 'local-entity' | 'placement' | 'generated-entity';
	readonly entityId: string | null;
	readonly definitionId: string | null;
	readonly label: AuthoringTextDto;
	readonly enabled: boolean;
	readonly modified: boolean;
	readonly editable: boolean;
	readonly target: HierarchySemanticTargetDto;
	readonly children: readonly HierarchyNodeDto[];
}

/** Definition/document context kept separate from actual hierarchy roots. */
export interface DefinitionContextDto {
	readonly assetId: string;
	readonly kind: 'scene-definition' | 'entity-definition';
	readonly origin: 'authored' | 'generated';
	readonly editable: boolean;
	readonly source: string;
	readonly label: AuthoringTextDto;
}

/** Complete authoritative snapshot returned when one structural definition is retained. */
export interface DefinitionSnapshotDto {
	readonly revision: number;
	readonly context: DefinitionContextDto;
	readonly roots: readonly HierarchyNodeDto[];
}

/** Exact generation-scoped result for opening one structural definition by AssetId. */
export type DefinitionOpenResultDto =
	| {
		readonly opened: true;
		readonly projectGeneration: number;
		readonly definition: DefinitionSnapshotDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly opened: false;
		readonly projectGeneration: null;
		readonly definition: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: string | null;
	};

/** Associates one validated authoring operation result with its owning Java connection generation. */
export type ProjectValueKindDto = 'null' | 'boolean' | 'number' | 'text' | 'array' | 'object'
	| 'reference' | 'entity-target' | 'component-target';

export interface InspectorComponentTypeDto {
	readonly id: string;
	readonly version: number;
}

export type InspectorValueDto =
	| { readonly kind: 'null' }
	| { readonly kind: 'boolean'; readonly value: boolean }
	| { readonly kind: 'number'; readonly decimal: string }
	| { readonly kind: 'text'; readonly value: string }
	| { readonly kind: 'array'; readonly values: readonly InspectorValueDto[] }
	| { readonly kind: 'object'; readonly values: Readonly<Record<string, InspectorValueDto>> }
	| {
		readonly kind: 'reference'; readonly referenceKind: 'project' | 'asset' | 'import';
		readonly locator: string; readonly label: string; readonly resolution: 'resolved' | 'broken';
		readonly revealUri: string | null;
	}
	| {
		readonly kind: 'entity-target'; readonly entityId: string; readonly label: string;
		readonly resolution: 'resolved' | 'broken'; readonly occurrence: HierarchyOccurrenceDto | null;
	}
	| {
		readonly kind: 'component-target'; readonly entityId: string; readonly componentId: string;
		readonly entityLabel: string; readonly componentLabel: string;
		readonly componentType: InspectorComponentTypeDto | null; readonly resolution: 'resolved' | 'broken';
		readonly occurrence: HierarchyOccurrenceDto | null;
	};

export type InspectorMutationTargetDto =
	| {
		readonly kind: 'entity-enabled'; readonly occurrence: HierarchyOccurrenceDto; readonly entityId: string;
	}
	| {
		readonly kind: 'component-property'; readonly occurrence: HierarchyOccurrenceDto; readonly entityId: string;
		readonly componentId: string; readonly propertyId: string;
	};

export interface InspectorNumericBoundDto {
	readonly decimal: string;
	readonly inclusive: boolean;
}

export interface InspectorEditorSemanticsDto {
	readonly semantic: 'default' | 'integer' | 'vector2' | 'vector3' | 'euler-rotation' | 'quaternion' | 'color-linear';
	readonly minimum: InspectorNumericBoundDto | null;
	readonly maximum: InspectorNumericBoundDto | null;
}

export interface InspectorConstraintsDto {
	readonly elementKind: ProjectValueKindDto | null;
	readonly exactElementCount: number | null;
	readonly acceptedReferenceKinds: readonly ('project' | 'asset' | 'import')[];
	readonly editor: InspectorEditorSemanticsDto;
}

export interface InspectorPropertyStateDto {
	readonly authoredValue: InspectorValueDto | null;
	readonly defaultValue: InspectorValueDto | null;
	readonly effectiveValue: InspectorValueDto | null;
	readonly origin: 'authored' | 'default' | 'unset';
	readonly validity: 'valid' | 'required-unset' | 'broken-reference' | 'metadata-unavailable';
	readonly editable: boolean;
	readonly modified: boolean;
}

export interface InspectorPropertyDto {
	readonly identity: string;
	readonly label: string;
	readonly description: string | null;
	readonly valueKind: ProjectValueKindDto;
	readonly required: boolean;
	readonly constraints: InspectorConstraintsDto;
	readonly state: InspectorPropertyStateDto;
	readonly mutationTarget: InspectorMutationTargetDto | null;
}

export interface InspectorTargetGroupDto {
	readonly identity: string;
	readonly kind: 'entity' | 'component' | 'placement';
	readonly label: string;
	readonly description: string | null;
	readonly componentId: string | null;
	readonly componentType: InspectorComponentTypeDto | null;
	readonly metadataStatus: 'available' | 'unavailable';
	readonly editable: boolean;
	readonly properties: readonly InspectorPropertyDto[];
}

export interface InspectorSnapshotDto {
	readonly revision: number;
	readonly target: HierarchySemanticTargetDto;
	readonly title: string;
	readonly definitionOrigin: 'authored' | 'generated';
	readonly provenance: 'local' | 'generated';
	readonly editable: boolean;
	readonly groups: readonly InspectorTargetGroupDto[];
}

export type InspectorReadResultDto =
	| {
		readonly read: true; readonly projectGeneration: number; readonly snapshot: InspectorSnapshotDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[]; readonly failureCode: null;
	}
	| {
		readonly read: false; readonly projectGeneration: null; readonly snapshot: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[]; readonly failureCode: string;
	};

/** Wire acknowledgement of process shutdown. */
export function validateDefinitionOpenResult(value: JsonValue): DefinitionOpenResultDto {
	const object = requiredObject(value, 'definition/open result');
	const opened = requiredBoolean(object.opened, 'opened');
	const generation = nullableInteger(object.projectGeneration, 'projectGeneration');
	const definition = object.definition === null ? null : validateDefinitionSnapshot(object.definition);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	if (opened) {
		if (generation === null || definition === null || failureCode !== null) {
			throw new Error('definition/open result has an inconsistent success shape');
		}
		return { opened: true, projectGeneration: generation, definition, diagnostics, failureCode: null };
	}
	if (generation !== null || definition !== null) {
		throw new Error('definition/open result has an inconsistent failure shape');
	}
	return { opened: false, projectGeneration: null, definition: null, diagnostics, failureCode };
}

/** Validates the exact discriminated Inspector read result. */
export function validateInspectorReadResult(value: JsonValue): InspectorReadResultDto {
	const object = requiredObject(value, 'inspector/read result');
	const read = requiredBoolean(object.read, 'read');
	const generation = nullableInteger(object.projectGeneration, 'projectGeneration');
	const snapshot = object.snapshot === null ? null : validateInspectorSnapshot(object.snapshot);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	if (read) {
		if (generation === null || snapshot === null || failureCode !== null) {
			throw new Error('inspector/read result has an inconsistent success shape');
		}
		return { read: true, projectGeneration: generation, snapshot, diagnostics, failureCode: null };
	}
	if (generation !== null || snapshot !== null || failureCode === null || failureCode.length === 0) {
		throw new Error('inspector/read result has an inconsistent rejection shape');
	}
	return { read: false, projectGeneration: null, snapshot: null, diagnostics, failureCode };
}

/** Validates one complete immutable Inspector snapshot. */
export function validateInspectorSnapshot(value: JsonValue | undefined): InspectorSnapshotDto {
	const object = requiredObject(value, 'inspector snapshot');
	const target = validateSemanticTarget(object.target);
	if (target.occurrence === null) {
		throw new Error('Inspector target must contain a hierarchy occurrence');
	}
	const groups = requiredArray(object.groups, 'inspector groups').map(validateInspectorGroup);
	const identities = new Set(groups.map(group => group.identity));
	if (identities.size !== groups.length) {
		throw new Error('Inspector group identities must be unique');
	}
	const editable = requiredBoolean(object.editable, 'inspector editable');
	if (!editable && groups.some(group => group.editable || group.properties.some(property => property.state.editable))) {
		throw new Error('A read-only Inspector snapshot cannot contain editable groups or properties');
	}
	return {
		revision: requiredInteger(object.revision, 'inspector revision'),
		target,
		title: requiredString(object.title, 'inspector title'),
		definitionOrigin: requiredDefinitionOrigin(object.definitionOrigin),
		provenance: requiredInspectorProvenance(object.provenance),
		editable,
		groups
	};
}

/** Validates one selectable Inspector target group. */
export function validateInspectorGroup(value: JsonValue): InspectorTargetGroupDto {
	const object = requiredObject(value, 'Inspector group');
	const kind = requiredInspectorGroupKind(object.kind);
	const componentId = nullableString(object.componentId, 'Inspector group componentId');
	const componentType = object.componentType === null ? null : validateInspectorComponentType(object.componentType);
	if ((componentId === null) !== (componentType === null) || (kind === 'component') !== (componentId !== null)) {
		throw new Error('Inspector component group identity is inconsistent');
	}
	const properties = requiredArray(object.properties, 'Inspector group properties').map(validateInspectorProperty);
	if (new Set(properties.map(property => property.identity)).size !== properties.length) {
		throw new Error('Inspector property identities must be unique within a group');
	}
	const metadataStatus = requiredMetadataStatus(object.metadataStatus);
	const editable = requiredBoolean(object.editable, 'Inspector group editable');
	if (!editable && properties.some(property => property.state.editable)) {
		throw new Error('A read-only Inspector group cannot contain editable properties');
	}
	if (metadataStatus === 'unavailable'
		&& (editable || properties.some(property => property.state.validity !== 'metadata-unavailable'))) {
		throw new Error('An Inspector group without metadata must remain visible and read-only');
	}
	return {
		identity: requiredNonEmptyString(object.identity, 'Inspector group identity'),
		kind,
		label: requiredString(object.label, 'Inspector group label'),
		description: nullableString(object.description, 'Inspector group description'),
		componentId,
		componentType,
		metadataStatus,
		editable,
		properties
	};
}

/** Validates one exact component type. */
export function validateInspectorComponentType(value: JsonValue | undefined): InspectorComponentTypeDto {
	const object = requiredObject(value, 'Inspector component type');
	return {
		id: requiredNonEmptyString(object.id, 'Inspector component type id'),
		version: requiredPositiveInteger(object.version, 'Inspector component type version')
	};
}

/** Validates one Inspector property and cross-field invariants. */
export function validateInspectorProperty(value: JsonValue): InspectorPropertyDto {
	const object = requiredObject(value, 'Inspector property');
	const valueKind = requiredProjectValueKind(object.valueKind);
	const constraints = validateInspectorConstraints(object.constraints, valueKind);
	const state = validateInspectorPropertyState(object.state, valueKind, constraints);
	const required = requiredBoolean(object.required, 'Inspector property required');
	if (state.validity === 'required-unset' && (!required || state.effectiveValue !== null)) {
		throw new Error('Required-unset validity requires a required property without an effective value');
	}
	const mutationTarget = object.mutationTarget === null ? null : validateInspectorMutationTarget(object.mutationTarget);
	if (state.editable !== (mutationTarget !== null)) {
		throw new Error('Inspector property editability must match mutation identity');
	}
	return {
		identity: requiredNonEmptyString(object.identity, 'Inspector property identity'),
		label: requiredString(object.label, 'Inspector property label'),
		description: nullableString(object.description, 'Inspector property description'),
		valueKind,
		required,
		constraints,
		state,
		mutationTarget
	};
}

/** Validates structural constraints and the closed typed semantic vocabulary. */
export function validateInspectorConstraints(value: JsonValue | undefined, valueKind: ProjectValueKindDto): InspectorConstraintsDto {
	const object = requiredObject(value, 'Inspector constraints');
	const elementKind = object.elementKind === null ? null : requiredProjectValueKind(object.elementKind);
	const exactElementCount = object.exactElementCount === null
		? null
		: requiredPositiveInteger(object.exactElementCount, 'Inspector exactElementCount');
	if (valueKind !== 'array' && (elementKind !== null || exactElementCount !== null)) {
		throw new Error('Only arrays can declare element constraints');
	}
	const acceptedReferenceKinds = requiredArray(object.acceptedReferenceKinds, 'acceptedReferenceKinds')
		.map(requiredReferenceKind);
	if (valueKind !== 'reference' && acceptedReferenceKinds.length !== 0) {
		throw new Error('Only reference properties can declare accepted reference kinds');
	}
	const editor = validateInspectorEditor(object.editor);
	if (valueKind !== 'number' && (editor.minimum !== null || editor.maximum !== null)) {
		throw new Error('Only number properties can declare numeric bounds');
	}
	validateEditorShape(editor.semantic, valueKind, elementKind, exactElementCount);
	return { elementKind, exactElementCount, acceptedReferenceKinds, editor };
}

/** Validates one closed typed editor-semantic description. */
export function validateInspectorEditor(value: JsonValue | undefined): InspectorEditorSemanticsDto {
	const object = requiredObject(value, 'Inspector editor semantics');
	return {
		semantic: requiredEditorSemantic(object.semantic),
		minimum: object.minimum === null ? null : validateNumericBound(object.minimum),
		maximum: object.maximum === null ? null : validateNumericBound(object.maximum)
	};
}

export function validateNumericBound(value: JsonValue | undefined): InspectorNumericBoundDto {
	const object = requiredObject(value, 'Inspector numeric bound');
	return {
		decimal: requiredDecimal(object.decimal, 'Inspector numeric bound decimal'),
		inclusive: requiredBoolean(object.inclusive, 'Inspector numeric bound inclusive')
	};
}

/** Validates authored/default/effective state without collapsing origin, validity, and editability. */
export function validateInspectorPropertyState(
	value: JsonValue | undefined,
	valueKind: ProjectValueKindDto,
	constraints: InspectorConstraintsDto
): InspectorPropertyStateDto {
	const object = requiredObject(value, 'Inspector property state');
	const authoredValue = object.authoredValue === null ? null : validateInspectorValue(object.authoredValue);
	const defaultValue = object.defaultValue === null ? null : validateInspectorValue(object.defaultValue);
	const effectiveValue = object.effectiveValue === null ? null : validateInspectorValue(object.effectiveValue);
	const origin = requiredPropertyOrigin(object.origin);
	if ((origin === 'authored' && (authoredValue === null || effectiveValue === null))
		|| (origin === 'default' && (authoredValue !== null || defaultValue === null || effectiveValue === null))
		|| (origin === 'unset' && (authoredValue !== null || effectiveValue !== null))) {
		throw new Error('Inspector property origin is inconsistent with projected values');
	}
	for (const projected of [authoredValue, defaultValue, effectiveValue]) {
		if (projected !== null) {
			validateInspectorValueShape(projected, valueKind, constraints);
		}
	}
	return {
		authoredValue,
		defaultValue,
		effectiveValue,
		origin,
		validity: requiredPropertyValidity(object.validity),
		editable: requiredBoolean(object.editable, 'Inspector property editable'),
		modified: requiredBoolean(object.modified, 'Inspector property modified')
	};
}

/** Rejects projected values that contradict their descriptor-owned structural shape. */
export function validateInspectorValueShape(
	value: InspectorValueDto,
	valueKind: ProjectValueKindDto,
	constraints: InspectorConstraintsDto
): void {
	if (value.kind !== valueKind) {
		throw new Error('Inspector property value does not match its structural kind');
	}
	if (value.kind !== 'array') {
		return;
	}
	if (constraints.exactElementCount !== null && value.values.length !== constraints.exactElementCount) {
		throw new Error('Inspector array value does not match its exact element count');
	}
	if (constraints.elementKind !== null && value.values.some(element => element.kind !== constraints.elementKind)) {
		throw new Error('Inspector array value does not match its element kind');
	}
}

/** Recursively validates every tagged Inspector value variant. */
export function validateInspectorValue(value: JsonValue | undefined): InspectorValueDto {
	const object = requiredObject(value, 'Inspector value');
	const kind = requiredString(object.kind, 'Inspector value kind');
	switch (kind) {
		case 'null': return { kind };
		case 'boolean': return { kind, value: requiredBoolean(object.value, 'Inspector boolean value') };
		case 'number': return { kind, decimal: requiredDecimal(object.decimal, 'Inspector number decimal') };
		case 'text': return { kind, value: requiredString(object.value, 'Inspector text value') };
		case 'array': return {
			kind,
			values: requiredArray(object.values, 'Inspector array values').map(validateInspectorValue)
		};
		case 'object': {
			const values = requiredObject(object.values, 'Inspector object values');
			const validated: Record<string, InspectorValueDto> = {};
			for (const [key, entry] of Object.entries(values)) {
				validated[key] = validateInspectorValue(entry);
			}
			return { kind, values: validated };
		}
		case 'reference': return {
			kind,
			referenceKind: requiredReferenceKind(object.referenceKind),
			locator: requiredNonEmptyString(object.locator, 'Inspector reference locator'),
			label: requiredString(object.label, 'Inspector reference label'),
			resolution: requiredResolution(object.resolution),
			revealUri: nullableString(object.revealUri, 'Inspector reference revealUri')
		};
		case 'entity-target': return {
			kind,
			entityId: requiredNonEmptyString(object.entityId, 'Inspector entity target id'),
			label: requiredString(object.label, 'Inspector entity target label'),
			resolution: requiredResolution(object.resolution),
			occurrence: object.occurrence === null ? null : validateOccurrence(object.occurrence)
		};
		case 'component-target': return {
			kind,
			entityId: requiredNonEmptyString(object.entityId, 'Inspector component target entity id'),
			componentId: requiredNonEmptyString(object.componentId, 'Inspector component target component id'),
			entityLabel: requiredString(object.entityLabel, 'Inspector component target entity label'),
			componentLabel: requiredString(object.componentLabel, 'Inspector component target component label'),
			componentType: object.componentType === null ? null : validateInspectorComponentType(object.componentType),
			resolution: requiredResolution(object.resolution),
			occurrence: object.occurrence === null ? null : validateOccurrence(object.occurrence)
		};
		default: throw new Error('Inspector value kind is invalid');
	}
}

/** Validates the closed future mutation identity union. */
export function validateInspectorMutationTarget(value: JsonValue | undefined): InspectorMutationTargetDto {
	const object = requiredObject(value, 'Inspector mutation target');
	const kind = requiredString(object.kind, 'Inspector mutation target kind');
	if (kind === 'entity-enabled') {
		return {
			kind,
			occurrence: validateOccurrence(object.occurrence),
			entityId: requiredNonEmptyString(object.entityId, 'Inspector mutation entityId')
		};
	}
	if (kind === 'component-property') {
		return {
			kind,
			occurrence: validateOccurrence(object.occurrence),
			entityId: requiredNonEmptyString(object.entityId, 'Inspector mutation entityId'),
			componentId: requiredNonEmptyString(object.componentId, 'Inspector mutation componentId'),
			propertyId: requiredNonEmptyString(object.propertyId, 'Inspector mutation propertyId')
		};
	}
	throw new Error('Inspector mutation target kind is invalid');
}

/** Serializes one already-validated semantic target as JSON request data. */
export function semanticTargetJson(target: HierarchySemanticTargetDto): JsonObject {
	return {
		kind: target.kind,
		source: target.source,
		identity: target.identity,
		occurrence: target.occurrence === null ? null : {
			definitionAssetId: target.occurrence.definitionAssetId,
			entityPath: [...target.occurrence.entityPath]
		}
	};
}

export function occurrenceJson(occurrence: HierarchyOccurrenceDto): JsonObject {
	return { definitionAssetId: occurrence.definitionAssetId, entityPath: [...occurrence.entityPath] };
}

/** Validates one complete structural-definition snapshot. */
export function validateDefinitionSnapshot(value: JsonValue | undefined): DefinitionSnapshotDto {
	const object = requiredObject(value, 'definition');
	const context = requiredObject(object.context, 'definition.context');
	const origin = requiredDefinitionOrigin(context.origin);
	const editable = requiredBoolean(context.editable, 'definition.context.editable');
	if (editable && origin !== 'authored') {
		throw new Error('a generated definition cannot be editable');
	}
	return {
		revision: requiredInteger(object.revision, 'definition.revision'),
		context: {
			assetId: requiredNonEmptyString(context.assetId, 'definition.context.assetId'),
			kind: requiredDefinitionKind(context.kind),
			origin,
			editable,
			source: requiredNonEmptyString(context.source, 'definition.context.source'),
			label: validateAuthoringText(context.label)
		},
		roots: requiredArray(object.roots, 'definition.roots').map(validateHierarchyNode)
	};
}

/** Recursively validates one hierarchy occurrence. */
export function validateHierarchyNode(value: JsonValue): HierarchyNodeDto {
	const object = requiredObject(value, 'hierarchy node');
	return {
		occurrence: validateOccurrence(object.occurrence),
		kind: requiredHierarchyKind(object.kind),
		entityId: nullableString(object.entityId, 'hierarchy node.entityId'),
		definitionId: nullableString(object.definitionId, 'hierarchy node.definitionId'),
		label: validateAuthoringText(object.label),
		enabled: requiredBoolean(object.enabled, 'hierarchy node.enabled'),
		modified: requiredBoolean(object.modified, 'hierarchy node.modified'),
		editable: requiredBoolean(object.editable, 'hierarchy node.editable'),
		target: validateSemanticTarget(object.target),
		children: requiredArray(object.children, 'hierarchy node.children').map(validateHierarchyNode)
	};
}

/** Validates semantic occurrence identity independently of tree presentation. */
export function validateOccurrence(value: JsonValue | undefined): HierarchyOccurrenceDto {
	const object = requiredObject(value, 'occurrence');
	return {
		definitionAssetId: requiredNonEmptyString(object.definitionAssetId, 'occurrence.definitionAssetId'),
		entityPath: requiredStringArray(object.entityPath, 'occurrence.entityPath')
	};
}

/** Validates one future-Inspector semantic target. */
export function validateSemanticTarget(value: JsonValue | undefined): HierarchySemanticTargetDto {
	const object = requiredObject(value, 'semantic target');
	return {
		kind: requiredTargetKind(object.kind),
		source: requiredNonEmptyString(object.source, 'semantic target.source'),
		identity: requiredNonEmptyString(object.identity, 'semantic target.identity'),
		occurrence: object.occurrence === null ? null : validateOccurrence(object.occurrence)
	};
}

/** Validates authored or Java-owned structured presentation text. */
export function validateAuthoringText(value: JsonValue | undefined): AuthoringTextDto {
	const object = requiredObject(value, 'authoring text');
	const kind = requiredTextKind(object.kind);
	const messageCode = nullableString(object.messageCode, 'authoring text.messageCode');
	if ((kind === 'message') !== (messageCode !== null)) {
		throw new Error('authoring text messageCode does not match kind');
	}
	return {
		kind,
		text: requiredString(object.text, 'authoring text.text'),
		messageCode,
		arguments: requiredStringArray(object.arguments, 'authoring text.arguments')
	};
}

/** Validates a service-shutdown acknowledgement received from Java. */
export function requiredDefinitionKind(value: JsonValue | undefined): DefinitionContextDto['kind'] {
	if (value !== 'scene-definition' && value !== 'entity-definition') {
		throw new Error('definition.context.kind is invalid');
	}
	return value;
}

/** Requires one semantic hierarchy kind. */
export function requiredHierarchyKind(value: JsonValue | undefined): HierarchyNodeDto['kind'] {
	if (value !== 'local-entity' && value !== 'placement' && value !== 'generated-entity') {
		throw new Error('hierarchy node.kind is invalid');
	}
	return value;
}

/** Requires one semantic target kind. */
export function requiredTargetKind(value: JsonValue | undefined): HierarchySemanticTargetDto['kind'] {
	if (value !== 'scene' && value !== 'local-entity' && value !== 'generated-entity' && value !== 'placement' && value !== 'asset') {
		throw new Error('semantic target.kind is invalid');
	}
	return value;
}

export function requiredInspectorProvenance(value: JsonValue | undefined): InspectorSnapshotDto['provenance'] {
	if (value !== 'local' && value !== 'generated') {
		throw new Error('Inspector provenance is invalid');
	}
	return value;
}

export function requiredInspectorGroupKind(value: JsonValue | undefined): InspectorTargetGroupDto['kind'] {
	if (value !== 'entity' && value !== 'component' && value !== 'placement') {
		throw new Error('Inspector group kind is invalid');
	}
	return value;
}

export function requiredMetadataStatus(value: JsonValue | undefined): InspectorTargetGroupDto['metadataStatus'] {
	if (value !== 'available' && value !== 'unavailable') {
		throw new Error('Inspector metadata status is invalid');
	}
	return value;
}

export function requiredProjectValueKind(value: JsonValue | undefined): ProjectValueKindDto {
	if (value !== 'null' && value !== 'boolean' && value !== 'number' && value !== 'text'
		&& value !== 'array' && value !== 'object' && value !== 'reference'
		&& value !== 'entity-target' && value !== 'component-target') {
		throw new Error('Inspector project value kind is invalid');
	}
	return value;
}

export function requiredResolution(value: JsonValue | undefined): 'resolved' | 'broken' {
	if (value !== 'resolved' && value !== 'broken') {
		throw new Error('Inspector resolution is invalid');
	}
	return value;
}

export function requiredEditorSemantic(value: JsonValue | undefined): InspectorEditorSemanticsDto['semantic'] {
	if (value !== 'default' && value !== 'integer' && value !== 'vector2' && value !== 'vector3'
		&& value !== 'euler-rotation' && value !== 'quaternion' && value !== 'color-linear') {
		throw new Error('Inspector editor semantic is invalid');
	}
	return value;
}

export function validateEditorShape(
	semantic: InspectorEditorSemanticsDto['semantic'],
	valueKind: ProjectValueKindDto,
	elementKind: ProjectValueKindDto | null,
	exactElementCount: number | null
): void {
	if (semantic === 'integer' && valueKind !== 'number') {
		throw new Error('Integer semantics require a number property');
	}
	const counts: Partial<Record<InspectorEditorSemanticsDto['semantic'], number>> = {
		vector2: 2,
		vector3: 3,
		'euler-rotation': 3,
		quaternion: 4,
		'color-linear': 3
	};
	const count = counts[semantic];
	if (count !== undefined && (valueKind !== 'array' || elementKind !== 'number' || exactElementCount !== count)) {
		throw new Error(`${semantic} semantics require a fixed numeric array`);
	}
}

export function requiredPropertyOrigin(value: JsonValue | undefined): InspectorPropertyStateDto['origin'] {
	if (value !== 'authored' && value !== 'default' && value !== 'unset') {
		throw new Error('Inspector property origin is invalid');
	}
	return value;
}

export function requiredPropertyValidity(value: JsonValue | undefined): InspectorPropertyStateDto['validity'] {
	if (value !== 'valid' && value !== 'required-unset' && value !== 'broken-reference'
		&& value !== 'metadata-unavailable') {
		throw new Error('Inspector property validity is invalid');
	}
	return value;
}

/** Requires one structured presentation-text kind. */
export function requiredTextKind(value: JsonValue | undefined): AuthoringTextDto['kind'] {
	if (value !== 'literal' && value !== 'message') {
		throw new Error('authoring text.kind is invalid');
	}
	return value;
}

/** Requires a JSON object at the named wire-contract location. */

