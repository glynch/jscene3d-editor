/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { definitionResourceUri } from '../definition/definitionResource';
import { DefinitionContextDto, DefinitionSnapshotDto, HierarchyNodeDto } from '../protocol/authoringProtocol';

suite('JScene3D authored definition state', () => {
	test('restores independent selections while switching between two Scene definitions', () => {
		const state = stateWithGeneration();
		const map = definition('scene-map', 'scene-definition', ['player', 'door']);
		const menu = definition('scene-menu', 'scene-definition', ['title', 'start-button']);
		state.register('definition:/map', 3, map);
		state.register('definition:/menu', 3, menu);

		state.activate('definition:/map');
		state.select(map.roots[0]);
		state.activate('definition:/menu');
		state.select(menu.roots[1]);
		state.activate('definition:/map');
		assert.strictEqual(state.selection?.target.identity, 'player');
		assert.strictEqual(state.selectedNode, map.roots[0]);

		state.activate('definition:/menu');
		assert.strictEqual(state.selection?.target.identity, 'start-button');
		assert.strictEqual(state.selectedNode, menu.roots[1]);
	});

	test('keeps Scene and EntityDefinition contexts independent', () => {
		const state = stateWithGeneration();
		const scene = definition('scene-map', 'scene-definition', ['player']);
		const entity = definition('entity-player', 'entity-definition', ['camera', 'weapon']);
		state.register('definition:/map', 3, scene);
		state.register('definition:/player', 3, entity);

		state.activate('definition:/map');
		state.select(scene.roots[0]);
		state.activate('definition:/player');
		state.select(entity.roots[1]);
		state.activate('definition:/map');
		assert.strictEqual(state.active?.snapshot.context.kind, 'scene-definition');
		assert.strictEqual(state.selection?.target.identity, 'player');
		state.activate('definition:/player');
		assert.strictEqual(state.active?.snapshot.context.kind, 'entity-definition');
		assert.strictEqual(state.selection?.target.identity, 'weapon');
	});

	test('does not inherit selection when activating a definition with no selection', () => {
		const state = stateWithGeneration();
		const first = definition('scene-first', 'scene-definition', ['selected']);
		const emptyContext = definition('scene-second', 'scene-definition', ['unselected']);
		state.register('definition:/first', 3, first);
		state.register('definition:/second', 3, emptyContext);
		state.activate('definition:/first');
		state.select(first.roots[0]);

		state.activate('definition:/second');

		assert.strictEqual(activeAssetId(state), 'scene-second');
		assert.strictEqual(state.selection, undefined);
		assert.strictEqual(state.selectedNode, undefined);
	});

	test('releases one closed definition without disturbing another context', () => {
		const state = stateWithGeneration();
		const first = definition('scene-first', 'scene-definition', ['first-selection']);
		const second = definition('scene-second', 'scene-definition', ['second-selection']);
		state.register('definition:/first', 3, first);
		state.register('definition:/second', 3, second);
		state.activate('definition:/first');
		state.select(first.roots[0]);
		state.activate('definition:/second');
		state.select(second.roots[0]);
		state.activate('definition:/first');

		state.unregister('definition:/first');

		assert.strictEqual(state.active, undefined);
		state.activate('definition:/second');
		assert.strictEqual(activeAssetId(state), 'scene-second');
		assert.strictEqual(state.selection?.target.identity, 'second-selection');
		assert.strictEqual(state.resolve('definition:/first'), undefined);
	});

	test('retains a stable occurrence across refresh and clears it when deleted', () => {
		const state = stateWithGeneration();
		const initial = definition('scene-map', 'scene-definition', ['player']);
		state.register('definition:/map', 3, initial);
		state.activate('definition:/map');
		state.select(initial.roots[0]);
		state.rememberInspectorGroup('transform');
		const moved = definition('scene-map', 'scene-definition', ['player'], 1, 'file:///moved/map.scene.json');
		state.update('definition:/map', moved);

		assert.strictEqual(state.active?.snapshot.revision, 1);
		assert.strictEqual(state.selectedNode, moved.roots[0]);
		assert.strictEqual(state.selection?.target.source, 'file:///moved/map.scene.json');
		assert.strictEqual(state.selectedInspectorGroupId, 'transform');

		state.update('definition:/map', definition('scene-map', 'scene-definition', ['door'], 2));
		assert.strictEqual(state.selection, undefined);
		assert.strictEqual(state.selectedNode, undefined);
		assert.strictEqual(state.selectedInspectorGroupId, undefined);
	});

	test('uses a deliberate empty supporting context when no definition is active', () => {
		const state = stateWithGeneration();
		const scene = definition('scene-map', 'scene-definition', ['player']);
		state.register('definition:/map', 3, scene);
		state.activate('definition:/map');
		state.select(scene.roots[0]);

		state.activate(undefined);

		assert.strictEqual(state.active, undefined);
		assert.strictEqual(state.selection, undefined);
		assert.strictEqual(state.selectedNode, undefined);
	});

	test('keeps a stale prior-connection context isolated after project generation resets', () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('scene-map', 'scene-definition', ['player']);
		const staleResource = definitionResourceUri('connection-a', 1, snapshot);
		const currentResource = definitionResourceUri('connection-b', 1, snapshot);
		state.setProjectGeneration(1);
		state.register(staleResource, 1, snapshot);
		state.activate(staleResource);
		state.select(snapshot.roots[0]);

		state.setProjectGeneration(undefined);
		state.setProjectGeneration(1);
		state.register(currentResource, 1, snapshot);
		state.activate(staleResource);
		assert.strictEqual(state.active, undefined);
		assert.strictEqual(state.selection, undefined);

		state.activate(currentResource);
		assert.strictEqual(activeAssetId(state), 'scene-map');
		assert.strictEqual(state.selection, undefined);
		assert.strictEqual(state.resolveAsset(1, 'scene-map')?.resource, currentResource);
	});
});

function stateWithGeneration(): AuthoredDefinitionState {
	const state = new AuthoredDefinitionState();
	state.setProjectGeneration(3);
	return state;
}

function activeAssetId(state: AuthoredDefinitionState): string | undefined {
	return state.active?.assetId;
}

function definition(
	assetId: string,
	kind: DefinitionContextDto['kind'],
	entityIds: readonly string[],
	revision = 0,
	source = `file:///${assetId}.json`
): DefinitionSnapshotDto {
	return {
		revision,
		context: {
			assetId,
			kind,
			origin: 'authored',
			editable: true,
			source,
			label: { kind: 'literal', text: assetId, messageCode: null, arguments: [] }
		},
		roots: entityIds.map(entityId => node(assetId, entityId, source))
	};
}

function node(definitionAssetId: string, identity: string, source: string): HierarchyNodeDto {
	const occurrence = { definitionAssetId, entityPath: [identity] };
	return {
		occurrence,
		kind: 'local-entity',
		entityId: identity,
		definitionId: null,
		label: { kind: 'literal', text: identity, messageCode: null, arguments: [] },
		enabled: true,
		modified: false,
		editable: true,
		target: { kind: 'local-entity', source, identity, occurrence },
		children: []
	};
}
