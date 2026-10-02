/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { definitionResourceUri } from '../definition/definitionResource';
import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D authored definition state', () => {
	test('tracks active mapped resources and TypeScript-owned semantic selection', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('world-a');
		state.setProjectGeneration(3);
		state.register('file:///world.scene.json?generation=3', 3, snapshot);

		state.activate('file:///world.scene.json?generation=3');
		state.select(snapshot.roots[0]);

		assert.strictEqual(state.active?.assetId, 'world-a');
		assert.deepStrictEqual(state.selection?.occurrence.entityPath, ['entity-a']);
		assert.strictEqual(state.selection?.target.identity, 'entity-a');
	});

	test('invalidates mappings, hierarchy, and selection when project generation changes', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('world-a');
		const resource = 'file:///world.scene.json?generation=3';
		state.setProjectGeneration(3);
		state.register(resource, 3, snapshot);
		state.activate(resource);
		state.select(snapshot.roots[0]);

		state.setProjectGeneration(4);

		assert.strictEqual(state.resolve(resource), undefined);
		assert.strictEqual(state.resolveAsset(4, 'world-a'), undefined);
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

	test('keeps a stale prior-connection tab isolated when project generation resets', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('world-a');
		const staleResource = definitionResourceUri('connection-a', 1, snapshot);
		const currentResource = definitionResourceUri('connection-b', 1, snapshot);
		state.setProjectGeneration(1);
		state.register(staleResource, 1, snapshot);
		state.activate(staleResource);
		state.select(snapshot.roots[0]);

		state.setProjectGeneration(undefined);
		state.setProjectGeneration(1);
		state.register(currentResource, 1, snapshot);
		assert.strictEqual(state.resolveAsset(1, 'world-a')?.resource, currentResource);
		state.activate(staleResource);
		const stale = { active: state.active, selection: state.selection };
		state.activate(currentResource);

		assert.deepStrictEqual({
			resourcesDiffer: staleResource !== currentResource,
			staleActive: stale.active,
			staleSelection: stale.selection,
			currentAssetId: state.active?.assetId
		}, {
			resourcesDiffer: true,
			staleActive: undefined,
			staleSelection: undefined,
			currentAssetId: 'world-a'
		});
	});
});

function definition(assetId: string): DefinitionSnapshotDto {
	const occurrence = { definitionAssetId: assetId, entityPath: ['entity-a'] };
	return {
		revision: 0,
		context: {
			assetId,
			kind: 'scene-definition',
			origin: 'authored',
			editable: true,
			source: 'file:///world.scene.json',
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
			target: { kind: 'local-entity', source: 'file:///world.scene.json', identity: 'entity-a', occurrence },
			children: []
		}]
	};
}
