/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createInspectorPresentation } from '../inspector/inspectorPresentation';
import { InspectorStateSnapshot } from '../inspector/inspectorState';
import { InspectorPropertyDto, InspectorSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D Inspector presentation', () => {
	test('projects empty, loading, and rejected state without retaining semantic state', () => {
		const selection = readyState(snapshot('Cube'), 'entity').selection;

		assert.deepStrictEqual([
			createInspectorPresentation({ status: 'empty' }, translate),
			createInspectorPresentation({ status: 'loading', selection }, translate),
			createInspectorPresentation({
				status: 'rejected', selection, failureCode: 'authoring.inspector.stale', diagnostics: []
			}, translate)
		].map(presentation => ({
			status: presentation.status,
			failureCode: presentation.status === 'rejected' ? presentation.failureCode : undefined
		})), [
			{ status: 'empty', failureCode: undefined },
			{ status: 'loading', failureCode: undefined },
			{ status: 'rejected', failureCode: 'authoring.inspector.stale' }
		]);
	});

	test('preserves authoritative ordering, property state, and mutation identity while enriching editors', () => {
		const inspector = snapshot('Cube');
		const presentation = createInspectorPresentation(readyState(inspector, 'transform'), translate);
		assert.strictEqual(presentation.status, 'ready');
		if (presentation.status !== 'ready') {
			return;
		}

		assert.deepStrictEqual({
			title: presentation.snapshot.title,
			selectedGroupId: presentation.selectedGroupId,
			groups: presentation.snapshot.groups.map(group => ({
				identity: group.identity,
				properties: group.properties.map(property => ({
					identity: property.identity,
					origin: property.state.origin,
					validity: property.state.validity,
					editable: property.state.editable,
					editor: property.propertyEditor.kind
				}))
			}))
		}, {
			title: 'Cube',
			selectedGroupId: 'transform',
			groups: [{
				identity: 'entity',
				properties: [{
					identity: 'enabled', origin: 'authored', validity: 'valid', editable: true, editor: 'boolean'
				}]
			}, {
				identity: 'transform',
				properties: [
					{ identity: 'position', origin: 'authored', validity: 'valid', editable: true, editor: 'vector3' },
					{ identity: 'scale', origin: 'default', validity: 'metadata-unavailable', editable: false, editor: 'vector3' }
				]
			}]
		});
		assert.strictEqual(
			presentation.snapshot.groups[1].properties[0].mutationTarget,
			inspector.groups[1].properties[0].mutationTarget
		);
		assert.strictEqual(presentation.snapshot.groups[1].properties[1].mutationTarget, null);
		assert.strictEqual(inspector.groups[1].properties[0].identity, 'position');
	});

	test('creates independent presentations for selection updates', () => {
		const first = createInspectorPresentation(readyState(snapshot('Cube'), 'entity'), translate);
		const second = createInspectorPresentation(readyState(snapshot('Crate'), 'transform'), translate);

		assert.deepStrictEqual([
			first.status === 'ready' ? [first.snapshot.title, first.selectedGroupId] : [],
			second.status === 'ready' ? [second.snapshot.title, second.selectedGroupId] : []
		], [['Cube', 'entity'], ['Crate', 'transform']]);
	});
});

function translate(message: string, ...args: string[]): string {
	return args.reduce((value, argument, index) => value.replace(`{${index}}`, argument), message);
}

function readyState(inspector: InspectorSnapshotDto, selectedGroupId: string): Extract<InspectorStateSnapshot, { status: 'ready' }> {
	return {
		status: 'ready',
		selection: {
			projectGeneration: 1,
			assetId: 'scene-a',
			occurrence: inspector.target.occurrence!,
			target: inspector.target
		},
		inspector,
		selectedGroupId
	};
}

function snapshot(title: string): InspectorSnapshotDto {
	const occurrence = { definitionAssetId: 'scene-a', entityPath: ['cube'] };
	const target = { kind: 'local-entity' as const, source: 'file:///scene.json', identity: 'cube', occurrence };
	return {
		revision: 2, target, title, definitionOrigin: 'authored', provenance: 'local', editable: true,
		groups: [{
			identity: 'entity', kind: 'entity', label: 'Entity', description: null,
			componentId: null, componentType: null, metadataStatus: 'available', editable: true,
			properties: [{
				...property('enabled', 'Enabled', 'boolean'),
				state: {
					authoredValue: { kind: 'boolean', value: true }, defaultValue: null,
					effectiveValue: { kind: 'boolean', value: true }, origin: 'authored', validity: 'valid',
					editable: true, modified: false
				},
				mutationTarget: { kind: 'entity-enabled', occurrence, entityId: 'cube' }
			}]
		}, {
			identity: 'transform', kind: 'component', label: 'Transform 3D', description: null,
			componentId: 'transform', componentType: { id: 'jscene3d/transform-3d', version: 1 },
			metadataStatus: 'available', editable: true,
			properties: [
				vectorProperty('position', 'Position', ['1', '2', '3'], true, 'valid'),
				vectorProperty('scale', 'Scale', ['1', '1', '1'], false, 'metadata-unavailable')
			]
		}]
	};
}

function property(
	identity: string,
	label: string,
	valueKind: InspectorPropertyDto['valueKind']
): Omit<InspectorPropertyDto, 'state' | 'mutationTarget'> {
	return {
		identity, label, description: null, valueKind, required: true,
		constraints: {
			elementKind: null, exactElementCount: null, acceptedReferenceKinds: [],
			editor: { semantic: 'default', minimum: null, maximum: null }
		}
	};
}

function vectorProperty(
	identity: string,
	label: string,
	decimals: readonly string[],
	editable: boolean,
	validity: InspectorPropertyDto['state']['validity']
): InspectorPropertyDto {
	const value = { kind: 'array' as const, values: decimals.map(decimal => ({ kind: 'number' as const, decimal })) };
	const occurrence = { definitionAssetId: 'scene-a', entityPath: ['cube'] };
	return {
		...property(identity, label, 'array'),
		constraints: {
			elementKind: 'number', exactElementCount: 3, acceptedReferenceKinds: [],
			editor: { semantic: 'vector3', minimum: null, maximum: null }
		},
		state: {
			authoredValue: editable ? value : null, defaultValue: editable ? null : value, effectiveValue: value,
			origin: editable ? 'authored' : 'default', validity, editable, modified: false
		},
		mutationTarget: editable ? {
			kind: 'component-property', occurrence, entityId: 'cube', componentId: 'transform', propertyId: identity
		} : null
	};
}
