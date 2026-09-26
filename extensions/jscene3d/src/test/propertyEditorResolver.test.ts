/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { resolvePropertyEditor } from '../inspector/propertyEditorResolver';
import {
	InspectorEditorSemanticsDto,
	InspectorPropertyDto,
	InspectorValueDto,
	ProjectValueKindDto
} from '../protocol/authoringProtocol';

suite('JScene3D Inspector property editor resolver', () => {
	test('resolves ordinary scalar and integer presentations without changing exact decimals', () => {
		assert.deepStrictEqual(resolvePropertyEditor(property('boolean', { kind: 'boolean', value: true })), {
			kind: 'boolean', value: true
		});
		assert.deepStrictEqual(resolvePropertyEditor(property(
			'number',
			{ kind: 'number', decimal: '12345678901234567890.12345678901234567890' },
			'default',
			{ minimum: { decimal: '-100000000000000000000.5', inclusive: true } }
		)), {
			kind: 'decimal',
			decimal: '12345678901234567890.12345678901234567890',
			minimum: { decimal: '-100000000000000000000.5', inclusive: true },
			maximum: null
		});
		assert.deepStrictEqual(resolvePropertyEditor(property(
			'number', { kind: 'number', decimal: '100000000000000000000' }, 'integer'
		)), {
			kind: 'integer', decimal: '100000000000000000000', minimum: null, maximum: null
		});
		assert.deepStrictEqual(resolvePropertyEditor(property('text', { kind: 'text', value: 'Player' })), {
			kind: 'text', value: 'Player'
		});
	});

	test('resolves every specialized numeric-array semantic before structural array summary', () => {
		assert.deepStrictEqual(resolvePropertyEditor(arrayProperty('vector2', ['1.25', '-4'])), {
			kind: 'vector2', collapsible: true, summary: '1.25, -4', unit: null,
			components: [{ label: 'X', decimal: '1.25' }, { label: 'Y', decimal: '-4' }]
		});
		assert.deepStrictEqual(resolvePropertyEditor(arrayProperty('vector3', ['-6', '0.875', '6'])), {
			kind: 'vector3', collapsible: true, summary: '-6, 0.875, 6', unit: null,
			components: [
				{ label: 'X', decimal: '-6' }, { label: 'Y', decimal: '0.875' }, { label: 'Z', decimal: '6' }
			]
		});
		assert.deepStrictEqual(resolvePropertyEditor(arrayProperty('euler-rotation', ['0', '90', '-2.5'])), {
			kind: 'eulerRotation', collapsible: true, summary: '0°, 90°, -2.5°', unit: 'degrees',
			components: [
				{ label: 'X', decimal: '0' }, { label: 'Y', decimal: '90' }, { label: 'Z', decimal: '-2.5' }
			]
		});
		assert.deepStrictEqual(resolvePropertyEditor(arrayProperty('quaternion', ['0', '0', '0', '1'])), {
			kind: 'quaternion', collapsible: true, summary: '0, 0, 0, 1', unit: null,
			components: [
				{ label: 'X', decimal: '0' }, { label: 'Y', decimal: '0' },
				{ label: 'Z', decimal: '0' }, { label: 'W', decimal: '1' }
			]
		});
		assert.deepStrictEqual(resolvePropertyEditor(arrayProperty('color-linear', ['1', '0.5', '2'])), {
			kind: 'linearColor', collapsible: true, summary: 'R 1, G 0.5, B 2', unit: null,
			components: [
				{ label: 'R', decimal: '1' }, { label: 'G', decimal: '0.5' }, { label: 'B', decimal: '2' }
			]
		});
	});

	test('routes references and authored targets through semantic presentations', () => {
		assert.deepStrictEqual(resolvePropertyEditor(property('reference', {
			kind: 'reference', referenceKind: 'asset', locator: 'mesh', label: 'Player mesh',
			resolution: 'resolved', revealUri: 'file:///project/assets/player.glb'
		})), {
			kind: 'reference', label: 'Player mesh', resolution: 'resolved',
			revealUri: 'file:///project/assets/player.glb'
		});
		assert.deepStrictEqual(resolvePropertyEditor(property('entity-target', {
			kind: 'entity-target', entityId: 'player', label: 'Player', resolution: 'resolved', occurrence: null
		})), {
			kind: 'entityTarget', label: 'Player', resolution: 'resolved'
		});
		assert.deepStrictEqual(resolvePropertyEditor(property('component-target', {
			kind: 'component-target', entityId: 'player', componentId: 'body',
			entityLabel: 'Player', componentLabel: 'Character Body', componentType: null,
			resolution: 'broken', occurrence: null
		})), {
			kind: 'componentTarget', entityLabel: 'Player', componentLabel: 'Character Body', resolution: 'broken'
		});
	});

	test('keeps ordinary arrays and objects summarized and supplies a defensive fallback', () => {
		const ordinaryArray = property('array', numericArray(['1', '2', '3']), 'default', {
			elementKind: 'number', exactElementCount: 3
		});
		const object = property('object', {
			kind: 'object', values: { x: { kind: 'number', decimal: '1' }, name: { kind: 'text', value: 'Player' } }
		});

		assert.deepStrictEqual(resolvePropertyEditor(ordinaryArray), { kind: 'collectionSummary', count: 3 });
		assert.deepStrictEqual(resolvePropertyEditor(object), { kind: 'objectSummary', count: 2 });
		assert.deepStrictEqual(resolvePropertyEditor(property('null', { kind: 'null' })), {
			kind: 'fallback', value: 'null'
		});
		assert.notStrictEqual(resolvePropertyEditor(ordinaryArray).kind, 'vector3');
		assert.notStrictEqual(resolvePropertyEditor(ordinaryArray).kind, 'eulerRotation');
		assert.notStrictEqual(resolvePropertyEditor(ordinaryArray).kind, 'linearColor');
	});
});

interface ConstraintOverrides {
	readonly minimum?: { readonly decimal: string; readonly inclusive: boolean };
	readonly maximum?: { readonly decimal: string; readonly inclusive: boolean };
	readonly elementKind?: ProjectValueKindDto;
	readonly exactElementCount?: number;
}

function property(
	valueKind: ProjectValueKindDto,
	value: InspectorValueDto,
	semantic: InspectorEditorSemanticsDto['semantic'] = 'default',
	overrides: ConstraintOverrides = {}
): InspectorPropertyDto {
	return {
		identity: 'property', label: 'Property', description: null, valueKind, required: false,
		constraints: {
			elementKind: overrides.elementKind ?? null,
			exactElementCount: overrides.exactElementCount ?? null,
			acceptedReferenceKinds: [],
			editor: {
				semantic, minimum: overrides.minimum ?? null, maximum: overrides.maximum ?? null
			}
		},
		state: {
			authoredValue: value, defaultValue: null, effectiveValue: value,
			origin: 'authored', validity: 'valid', editable: false
		},
		mutationTarget: null
	};
}

function arrayProperty(
	semantic: InspectorEditorSemanticsDto['semantic'],
	decimals: readonly string[]
): InspectorPropertyDto {
	return property('array', numericArray(decimals), semantic, {
		elementKind: 'number', exactElementCount: decimals.length
	});
}

function numericArray(decimals: readonly string[]): InspectorValueDto {
	return { kind: 'array', values: decimals.map(decimal => ({ kind: 'number', decimal })) };
}
