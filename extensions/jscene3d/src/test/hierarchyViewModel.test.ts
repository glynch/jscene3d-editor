/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { filterHierarchyNodes, hierarchyTreeItem, occurrenceKey, revealJScene3DProject } from '../hierarchy/hierarchyViewModel';
import { HierarchyNodeDto } from '../protocol/authoringProtocol';

suite('JScene3D hierarchy view model', () => {
	test('reveals the JScene3D Project through the generated Hierarchy focus command', async () => {
		const commands: string[] = [];

		await revealJScene3DProject(command => {
			commands.push(command);
		});

		assert.deepStrictEqual(commands, ['jscene3d.hierarchy.focus']);
	});

	test('uses semantic occurrence identity instead of labels or indexes', () => {
		const occurrence = { definitionAssetId: 'definition-a', entityPath: ['placement-a', 'entity-a'] };
		const node: HierarchyNodeDto = {
			occurrence,
			kind: 'generated-entity',
			entityId: 'entity-a',
			definitionId: null,
			label: { kind: 'literal', text: 'Repeated label', messageCode: null, arguments: [] },
			enabled: true,
			modified: false,
			editable: false,
			target: { kind: 'generated-entity', source: 'import://definition-a', identity: 'entity-a', occurrence },
			children: []
		};

		assert.strictEqual(occurrenceKey(occurrence), 'definition-a/placement-a/entity-a');
		assert.deepStrictEqual(hierarchyTreeItem(node), {
			id: 'definition-a/placement-a/entity-a',
			label: 'Repeated label',
			kind: 'generated-entity',
			enabled: true,
			editable: false,
			hasChildren: false
		});
	});

	test('filters by entity name while retaining matching ancestry', () => {
		const cube = hierarchyNode('Cube', ['cube']);
		const crate = hierarchyNode('Crate', ['environment', 'props', 'crate']);
		const props = { ...hierarchyNode('Props', ['environment', 'props']), children: [crate] };
		const environment = { ...hierarchyNode('Environment', ['environment']), children: [props] };
		const camera = hierarchyNode('Main Camera', ['camera']);
		const nodes = [cube, environment, camera];

		assert.deepStrictEqual(filterHierarchyNodes(nodes, 'u'), [cube]);
		assert.deepStrictEqual(filterHierarchyNodes(nodes, 'crate'), [{
			...environment,
			children: [{ ...props, children: [crate] }]
		}]);
		assert.deepStrictEqual(filterHierarchyNodes(nodes, 'CAMERA'), [camera]);
		assert.strictEqual(filterHierarchyNodes(nodes, '  '), nodes);
	});
});

function hierarchyNode(label: string, entityPath: readonly string[]): HierarchyNodeDto {
	const identity = entityPath.at(-1)!;
	const occurrence = { definitionAssetId: 'scene-a', entityPath };
	return {
		occurrence,
		kind: 'local-entity',
		entityId: identity,
		definitionId: null,
		label: { kind: 'literal', text: label, messageCode: null, arguments: [] },
		enabled: true,
		modified: false,
		editable: true,
		target: { kind: 'local-entity', source: 'file:///scene.json', identity, occurrence },
		children: []
	};
}
