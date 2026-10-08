/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	acceptsPropertyEditorCandidate,
	numericInputStatus,
	resolvePropertyEditor
} from '../inspector/propertyEditorResolver';
import {
	InspectorEditorSemanticsDto,
	InspectorPropertyDto,
	InspectorValueDto,
	ProjectValueKindDto
} from '../protocol/authoringProtocol';

suite('JScene3D Inspector property editor resolver', () => {
	test('resolves ordinary scalar and integer presentations without changing exact decimals', () => {
		assert.deepStrictEqual(resolvePropertyEditor(property('boolean', { kind: 'boolean', value: true })), {
			kind: 'boolean', value: true, editable: false
		});
		assert.deepStrictEqual(resolvePropertyEditor(property(
			'number',
			{ kind: 'number', decimal: '12345678901234567890.12345678901234567890' },
			'default',
			{ minimum: { decimal: '-100000000000000000000.5', inclusive: true } }
		)), {
			kind: 'decimal',
			decimal: '12345678901234567890.12345678901234567890',
			editable: false,
			minimum: { decimal: '-100000000000000000000.5', inclusive: true },
			maximum: null,
			completePattern: '^[+-]?(?:(?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))(?:[eE][+-]?\\d+)?$',
			intermediatePattern: '^(?:[+-]?|[+-]?\\.|[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)[eE][+-]?)$'
		});
		assert.deepStrictEqual(resolvePropertyEditor(property(
			'number', { kind: 'number', decimal: '100000000000000000000' }, 'integer'
		)), {
			kind: 'integer', decimal: '100000000000000000000', editable: false, minimum: null, maximum: null,
			completePattern: '^[+-]?\\d+$', intermediatePattern: '^[+-]?$'
		});
		assert.deepStrictEqual(resolvePropertyEditor(property('text', { kind: 'text', value: 'Player' })), {
			kind: 'text', value: 'Player', editable: false
		});
	});

	test('enables only authoritative simple scalar mutation targets', () => {
		const readonly = property('text', { kind: 'text', value: 'Player' });
		const editable: InspectorPropertyDto = {
			...readonly,
			state: { ...readonly.state, editable: true },
			mutationTarget: {
				kind: 'component-property',
				occurrence: { definitionAssetId: 'world-a', entityPath: ['entity-a'] },
				entityId: 'entity-a', componentId: 'component-a', propertyId: 'name'
			}
		};

		assert.deepStrictEqual(resolvePropertyEditor(editable), { kind: 'text', value: 'Player', editable: true });
	});

	test('uses the closed scalar registry to validate typed edit candidates', () => {
		assert.strictEqual(acceptsPropertyEditorCandidate(property('boolean', { kind: 'boolean', value: true }), {
			kind: 'boolean', value: false
		}), true);
		assert.strictEqual(acceptsPropertyEditorCandidate(property(
			'number', { kind: 'number', decimal: '1' }, 'integer'
		), { kind: 'integer', literal: '12345678901234567890' }), true);
		assert.strictEqual(acceptsPropertyEditorCandidate(property('number', { kind: 'number', decimal: '1.25' }), {
			kind: 'number', literal: '0.00000000000000000001'
		}), true);
		assert.strictEqual(acceptsPropertyEditorCandidate(property('text', { kind: 'text', value: 'before' }), {
			kind: 'text', literal: 'after'
		}), true);
		assert.strictEqual(acceptsPropertyEditorCandidate(property(
			'number', { kind: 'number', decimal: '1' }, 'integer'
		), { kind: 'number', literal: '1' }), false);
		assert.strictEqual(acceptsPropertyEditorCandidate(arrayProperty('vector3', ['1', '2', '3']), {
			kind: 'text', literal: 'unsupported'
		}), false);
	});

	test('rejects syntactically impossible exact numeric candidates before mutation', () => {
		const integer = property('number', { kind: 'number', decimal: '1' }, 'integer');
		const number = property('number', { kind: 'number', decimal: '1.25' });

		for (const literal of ['0', '42', '-42', '123456789012345678901234567890']) {
			assert.strictEqual(acceptsPropertyEditorCandidate(integer, { kind: 'integer', literal }), true);
		}
		for (const literal of ['1.5', 'abc', '12abc']) {
			assert.strictEqual(acceptsPropertyEditorCandidate(integer, { kind: 'integer', literal }), false);
		}
		for (const literal of [
			'0', '0.34', '-1.25', '12345678901234567890.12345678901234567890',
			'0.000000000000000000000000000001', '1.', '-0.', '1e3', '-2.5E-7'
		]) {
			assert.strictEqual(acceptsPropertyEditorCandidate(number, { kind: 'number', literal }), true);
		}
		for (const literal of ['0.3aaaaaaa', 'abc', '12abc', '-', '.', '1e', '1e+']) {
			assert.strictEqual(acceptsPropertyEditorCandidate(number, { kind: 'number', literal }), false);
		}
	});

	test('distinguishes useful numeric typing prefixes from impossible syntax', () => {
		for (const literal of ['', '+', '-']) {
			assert.strictEqual(numericInputStatus('integer', literal), 'intermediate');
		}
		for (const literal of ['', '+', '-', '.', '+.', '-.', '1e', '1e+', '-2.5E-']) {
			assert.strictEqual(numericInputStatus('number', literal), 'intermediate');
		}
		for (const literal of ['e', '+e', '1ee', '1e+a']) {
			assert.strictEqual(numericInputStatus('number', literal), 'invalid');
		}
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
			kind: 'reference', label: 'Player mesh', locator: 'mesh', resolution: 'resolved',
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
			origin: 'authored', validity: 'valid', editable: false, modified: false
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
