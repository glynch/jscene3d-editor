/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { InspectorSelectionReveal } from '../inspector/inspectorSelectionReveal';
import { DefinitionSnapshotDto, HierarchyNodeDto } from '../protocol/authoringProtocol';

suite('JScene3D Inspector selection reveal', () => {
	test('reveals for shared selections from Hierarchy and Scene View but not for clearing', async () => {
		const definitions = activeDefinitions();
		let reveals = 0;
		const registration = new InspectorSelectionReveal(
			definitions, () => false, () => { reveals++; }, error => { throw error; });
		const selected = definitions.active!.snapshot.roots[0];

		definitions.select(selected);
		await Promise.resolve();
		definitions.clearSelection();
		await Promise.resolve();
		assert.strictEqual(definitions.selectOccurrence(selected.occurrence), true);
		await Promise.resolve();

		assert.strictEqual(reveals, 2);
		registration.dispose();
	});

	test('updates an already visible Inspector in place without refocusing it', async () => {
		const definitions = activeDefinitions();
		let visible = true;
		let reveals = 0;
		const registration = new InspectorSelectionReveal(
			definitions, () => visible, () => { reveals++; }, error => { throw error; });
		const selected = definitions.active!.snapshot.roots[0];

		definitions.select(selected);
		await Promise.resolve();
		assert.strictEqual(reveals, 0);

		visible = false;
		definitions.clearSelection();
		definitions.select(selected);
		await Promise.resolve();
		assert.strictEqual(reveals, 1);
		registration.dispose();
	});

	test('stops revealing when its feature registration is disposed', async () => {
		const definitions = activeDefinitions();
		let reveals = 0;
		const registration = new InspectorSelectionReveal(
			definitions, () => false, () => { reveals++; }, error => { throw error; });
		registration.dispose();

		definitions.select(definitions.active!.snapshot.roots[0]);
		await Promise.resolve();

		assert.strictEqual(reveals, 0);
	});
});

function activeDefinitions(): AuthoredDefinitionState {
	const definitions = new AuthoredDefinitionState();
	const current = snapshot();
	definitions.setProjectGeneration(7);
	definitions.register('scene-resource', 7, current);
	definitions.activate('scene-resource');
	return definitions;
}

function snapshot(): DefinitionSnapshotDto {
	return {
		revision: 1,
		context: {
			assetId: 'scene-a', kind: 'scene-definition', origin: 'authored', editable: true,
			source: 'file:///project/scene-a.scene.json',
			label: { kind: 'literal', text: 'Scene A', messageCode: null, arguments: [] }
		},
		roots: [node()]
	};
}

function node(): HierarchyNodeDto {
	const occurrence = { definitionAssetId: 'scene-a', entityPath: ['cube'] };
	return {
		occurrence, kind: 'local-entity', entityId: 'cube', definitionId: null,
		label: { kind: 'literal', text: 'Cube', messageCode: null, arguments: [] },
		enabled: true, modified: false, editable: true,
		target: {
			kind: 'local-entity', source: 'file:///project/scene-a.scene.json', identity: 'cube', occurrence
		},
		children: []
	};
}
