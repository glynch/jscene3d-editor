/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionOpener, authoredDefinitionViewType } from '../definition/authoredDefinitionOpener';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { definitionResourceUri } from '../definition/definitionResource';
import { ConnectionScopedResult, DefinitionOpenResultDto, DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D authored definition opener', () => {
	test('opens the generation-scoped resource through the JScene3D custom view type', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		const opened: Array<{ resource: string; viewType: string }> = [];
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => connected(success(4, definition('definition-a'))) },
			state,
			async (resource, viewType) => { opened.push({ resource, viewType }); }
		);

		const outcome = await opener.open(4, 'definition-a');

		assert.strictEqual(outcome.status, 'opened');
		assert.strictEqual(outcome.status === 'opened' ? outcome.resource.assetId : undefined, 'definition-a');
		assert.strictEqual(opened[0].viewType, authoredDefinitionViewType);
		assert.strictEqual(new URL(opened[0].resource).searchParams.get('jscene3dConnectionGeneration'), 'connection-a');
		assert.strictEqual(new URL(opened[0].resource).searchParams.get('jscene3dGeneration'), '4');
	});

	test('preserves an expected rejection and its diagnostics without opening an editor', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		let openCalls = 0;
		const diagnostics = [{
			severity: 'error' as const,
			code: 'definition.invalid',
			message: 'The definition is invalid',
			source: 'file:///projects/game/worlds/main.scene.json',
			location: '/root',
			details: {}
		}];
		const opener = new AuthoredDefinitionOpener(
			{
				openDefinition: async () => connected({
					opened: false,
					projectGeneration: null,
					definition: null,
					diagnostics,
					failureCode: 'definition.invalid'
				})
			},
			state,
			async () => { openCalls++; }
		);

		const outcome = await opener.open(4, 'definition-a');

		assert.deepStrictEqual(outcome, { status: 'rejected', diagnostics, failureCode: 'definition.invalid' });
		assert.strictEqual(openCalls, 0);
	});

	test('does not register a response for a different generation', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		let openCalls = 0;
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => connected(success(5, definition('definition-a'))) },
			state,
			async () => { openCalls++; }
		);

		await assert.rejects(opener.open(4, 'definition-a'), /does not match/);
		assert.strictEqual(openCalls, 0);
	});

	test('focuses the recovered hot-exit resource instead of opening a duplicate current-session URI', async () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('definition-a');
		const recoveredResource = definitionResourceUri('connection-before-restart', 4, snapshot);
		state.setProjectGeneration(4);
		state.register(recoveredResource, 4, snapshot);
		const opened: string[] = [];
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => connected(success(4, snapshot), 'connection-after-restart') },
			state,
			async resource => { opened.push(resource); }
		);

		const outcome = await opener.open(4, 'definition-a');

		assert.strictEqual(outcome.status, 'opened');
		assert.deepStrictEqual(opened, [recoveredResource]);
		assert.strictEqual(outcome.status === 'opened' ? outcome.resource.resource : undefined, recoveredResource);
	});
});

function success(projectGeneration: number, definition: DefinitionSnapshotDto): DefinitionOpenResultDto {
	return { opened: true, projectGeneration, definition, diagnostics: [], failureCode: null };
}

function connected(
	result: DefinitionOpenResultDto,
	connectionGeneration = 'connection-a'
): ConnectionScopedResult<DefinitionOpenResultDto> {
	return { connectionGeneration, result };
}

function definition(assetId: string): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId,
			kind: 'scene-definition',
			origin: 'authored',
			editable: true,
			source: 'file:///projects/game/worlds/main.scene.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: []
	};
}
