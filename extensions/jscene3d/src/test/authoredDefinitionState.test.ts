/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D authored definition state', () => {
	test('tracks active mapped resources and TypeScript-owned semantic selection', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('world-a');
		state.setProjectGeneration(3);
		state.register('file:///world.world.json?generation=3', 3, snapshot);

		state.activate('file:///world.world.json?generation=3');
		state.select(snapshot.roots[0]);

		assert.strictEqual(state.active?.assetId, 'world-a');
		assert.deepStrictEqual(state.selection?.occurrence.entityPath, ['entity-a']);
		assert.strictEqual(state.selection?.target.identity, 'entity-a');
	});

	test('invalidates mappings, hierarchy, and selection when project generation changes', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('world-a');
		const resource = 'file:///world.world.json?generation=3';
		state.setProjectGeneration(3);
		state.register(resource, 3, snapshot);
		state.activate(resource);
		state.select(snapshot.roots[0]);

		state.setProjectGeneration(4);

		assert.strictEqual(state.resolve(resource), undefined);
		assert.strictEqual(state.active, undefined);
		assert.strictEqual(state.selection, undefined);
	});

	test('explicitly clears semantic selection when native Hierarchy selection becomes empty', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('world-a');
		state.setProjectGeneration(3);
		state.register('jscene3d-definition:/world-a', 3, snapshot);
		state.activate('jscene3d-definition:/world-a');
		state.select(snapshot.roots[0]);

		state.clearSelection();

		assert.strictEqual(state.selection, undefined);
	});

	test('uses a deliberate no-active state for unrelated or stale tabs', () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(3);
		state.register('jscene3d-definition:/world-a', 3, definition('world-a'));

		state.activate('file:///ordinary.txt');

		assert.strictEqual(state.active, undefined);
	});
});

function definition(assetId: string): DefinitionSnapshotDto {
	const occurrence = { definitionAssetId: assetId, entityPath: ['entity-a'] };
	return {
		revision: 0,
		context: {
			assetId,
			kind: 'world-definition',
			origin: 'authored',
			editable: true,
			source: 'file:///world.world.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: [{
			occurrence,
			kind: 'local-entity',
			entityId: 'entity-a',
			definitionId: null,
			label: { kind: 'literal', text: 'Entity', messageCode: null, arguments: [] },
			enabled: true,
			modified: false,
			editable: true,
			target: { kind: 'local-entity', source: 'file:///world.world.json', identity: 'entity-a', occurrence },
			children: []
		}]
	};
}
