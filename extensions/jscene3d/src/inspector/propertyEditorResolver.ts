/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	InspectorNumericBoundDto,
	InspectorPropertyDto,
	InspectorValueDto
} from '../protocol/authoringProtocol';

export interface ReadonlyPropertyEditorComponent {
	readonly label: 'X' | 'Y' | 'Z' | 'W' | 'R' | 'G' | 'B';
	readonly decimal: string | null;
}

interface ReadonlyNumericPropertyEditorModel {
	readonly decimal: string | null;
	readonly minimum: InspectorNumericBoundDto | null;
	readonly maximum: InspectorNumericBoundDto | null;
}

interface ReadonlyComponentPropertyEditorModel {
	readonly collapsible: true;
	readonly components: readonly ReadonlyPropertyEditorComponent[];
	readonly summary: string;
	readonly unit: 'degrees' | null;
}

/** Closed presentation vocabulary used only by the built-in read-only Inspector. */
export type ReadonlyPropertyEditorModel =
	| { readonly kind: 'boolean'; readonly value: boolean | null }
	| ({ readonly kind: 'decimal' } & ReadonlyNumericPropertyEditorModel)
	| ({ readonly kind: 'integer' } & ReadonlyNumericPropertyEditorModel)
	| { readonly kind: 'text'; readonly value: string | null }
	| ({ readonly kind: 'vector2' } & ReadonlyComponentPropertyEditorModel)
	| ({ readonly kind: 'vector3' } & ReadonlyComponentPropertyEditorModel)
	| ({ readonly kind: 'eulerRotation' } & ReadonlyComponentPropertyEditorModel)
	| ({ readonly kind: 'quaternion' } & ReadonlyComponentPropertyEditorModel)
	| ({ readonly kind: 'linearColor' } & ReadonlyComponentPropertyEditorModel)
	| {
		readonly kind: 'reference';
		readonly label: string | null;
		readonly resolution: 'resolved' | 'broken' | null;
		readonly revealUri: string | null;
	}
	| {
		readonly kind: 'entityTarget';
		readonly label: string | null;
		readonly resolution: 'resolved' | 'broken' | null;
	}
	| {
		readonly kind: 'componentTarget';
		readonly entityLabel: string | null;
		readonly componentLabel: string | null;
		readonly resolution: 'resolved' | 'broken' | null;
	}
	| { readonly kind: 'collectionSummary'; readonly count: number | null }
	| { readonly kind: 'objectSummary'; readonly count: number | null }
	| { readonly kind: 'fallback'; readonly value: 'unset' | 'null' | 'unsupported' };

/** Resolves one validated Inspector property to the built-in read-only presentation model. */
export function resolvePropertyEditor(property: InspectorPropertyDto): ReadonlyPropertyEditorModel {
	const value = property.state.effectiveValue;
	const semantic = property.constraints.editor.semantic;
	switch (semantic) {
		case 'integer':
			return numericEditor('integer', property, value);
		case 'vector2':
			return componentEditor('vector2', ['X', 'Y'], null, value);
		case 'vector3':
			return componentEditor('vector3', ['X', 'Y', 'Z'], null, value);
		case 'euler-rotation':
			return componentEditor('eulerRotation', ['X', 'Y', 'Z'], 'degrees', value);
		case 'quaternion':
			return componentEditor('quaternion', ['X', 'Y', 'Z', 'W'], null, value);
		case 'color-linear':
			return componentEditor('linearColor', ['R', 'G', 'B'], null, value);
		case 'default':
			return structuralEditor(property, value);
	}
}

function structuralEditor(
	property: InspectorPropertyDto,
	value: InspectorValueDto | null
): ReadonlyPropertyEditorModel {
	switch (property.valueKind) {
		case 'boolean':
			return { kind: 'boolean', value: value?.kind === 'boolean' ? value.value : null };
		case 'number':
			return numericEditor('decimal', property, value);
		case 'text':
			return { kind: 'text', value: value?.kind === 'text' ? value.value : null };
		case 'reference':
			return value?.kind === 'reference'
				? {
					kind: 'reference', label: value.label, resolution: value.resolution,
					revealUri: value.revealUri
				}
				: { kind: 'reference', label: null, resolution: null, revealUri: null };
		case 'entity-target':
			return value?.kind === 'entity-target'
				? { kind: 'entityTarget', label: value.label, resolution: value.resolution }
				: { kind: 'entityTarget', label: null, resolution: null };
		case 'component-target':
			return value?.kind === 'component-target'
				? {
					kind: 'componentTarget', entityLabel: value.entityLabel,
					componentLabel: value.componentLabel, resolution: value.resolution
				}
				: { kind: 'componentTarget', entityLabel: null, componentLabel: null, resolution: null };
		case 'array':
			return { kind: 'collectionSummary', count: value?.kind === 'array' ? value.values.length : null };
		case 'object':
			return { kind: 'objectSummary', count: value?.kind === 'object' ? Object.keys(value.values).length : null };
		case 'null':
			return fallbackEditor(property, value);
	}
}

function numericEditor(
	kind: 'decimal' | 'integer',
	property: InspectorPropertyDto,
	value: InspectorValueDto | null
): ReadonlyPropertyEditorModel {
	return {
		kind,
		decimal: value?.kind === 'number' ? value.decimal : null,
		minimum: property.constraints.editor.minimum,
		maximum: property.constraints.editor.maximum
	};
}

function componentEditor(
	kind: 'vector2' | 'vector3' | 'eulerRotation' | 'quaternion' | 'linearColor',
	labels: readonly ReadonlyPropertyEditorComponent['label'][],
	unit: 'degrees' | null,
	value: InspectorValueDto | null
): ReadonlyPropertyEditorModel {
	if (value === null) {
		const components = labels.map(label => ({ label, decimal: null }));
		return {
			kind, collapsible: true, unit, components,
			summary: componentSummary(components, unit, kind === 'linearColor')
		};
	}
	if (value.kind !== 'array' || value.values.length !== labels.length) {
		return { kind: 'fallback', value: 'unsupported' };
	}
	const components: ReadonlyPropertyEditorComponent[] = [];
	for (let index = 0; index < labels.length; index++) {
		const component = value.values[index];
		if (component.kind !== 'number') {
			return { kind: 'fallback', value: 'unsupported' };
		}
		components.push({ label: labels[index], decimal: component.decimal });
	}
	return {
		kind, collapsible: true, unit, components,
		summary: componentSummary(components, unit, kind === 'linearColor')
	};
}

function componentSummary(
	components: readonly ReadonlyPropertyEditorComponent[],
	unit: 'degrees' | null,
	includeLabels: boolean
): string {
	return components
		.map(component => {
			const value = component.decimal === null ? '—' : component.decimal + (unit === 'degrees' ? '°' : '');
			return includeLabels ? `${component.label} ${value}` : value;
		})
		.join(', ');
}

function fallbackEditor(
	property: InspectorPropertyDto,
	value: InspectorValueDto | null
): ReadonlyPropertyEditorModel {
	if (value === null && property.state.origin === 'unset') {
		return { kind: 'fallback', value: 'unset' };
	}
	return { kind: 'fallback', value: value?.kind === 'null' ? 'null' : 'unsupported' };
}
