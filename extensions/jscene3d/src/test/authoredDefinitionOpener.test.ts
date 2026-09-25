/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionOpener, authoredDefinitionViewType } from '../definition/authoredDefinitionOpener';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { DefinitionOpenResultDto, DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D authored definition opener', () => {
	test('opens the generation-scoped resource through the JScene3D custom view type', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		const opened: Array<{ resource: string; viewType: string }> = [];
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => success(4, definition('definition-a')) },
			state,
			async (resource, viewType) => { opened.push({ resource, viewType }); }
		);

		const mapping = await opener.open(4, 'definition-a');

		assert.strictEqual(mapping.assetId, 'definition-a');
		assert.strictEqual(opened[0].viewType, authoredDefinitionViewType);
		assert.strictEqual(new URL(opened[0].resource).searchParams.get('jscene3dGeneration'), '4');
	});

	test('does not register a response for a different generation', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		let openCalls = 0;
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => success(5, definition('definition-a')) },
			state,
			async () => { openCalls++; }
		);

		await assert.rejects(opener.open(4, 'definition-a'), /does not match/);
		assert.strictEqual(openCalls, 0);
	});
});

function success(projectGeneration: number, definition: DefinitionSnapshotDto): DefinitionOpenResultDto {
	return { opened: true, projectGeneration, definition, diagnostics: [], failureCode: null };
}

function definition(assetId: string): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId,
			kind: 'world-definition',
			origin: 'authored',
			editable: true,
			source: 'file:///projects/game/worlds/main.world.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: []
	};
}
