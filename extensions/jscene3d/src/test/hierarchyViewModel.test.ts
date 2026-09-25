/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { hierarchyTreeItem, occurrenceKey } from '../hierarchy/hierarchyViewModel';
import { HierarchyNodeDto } from '../protocol/authoringProtocol';

suite('JScene3D hierarchy view model', () => {
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
});
