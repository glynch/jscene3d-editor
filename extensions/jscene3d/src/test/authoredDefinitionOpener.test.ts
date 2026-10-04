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
	test('opens a Scene through its semantic Scene editor identity', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		const opened: Array<{ resource: string; viewType: string; label: string }> = [];
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => connected(success(4, definition('definition-a', 'scene-definition', 'Main'))) },
			state,
			async (resource, viewType, label) => {
				assert.strictEqual(state.resolveAsset(4, 'definition-a')?.resource, resource);
				opened.push({ resource, viewType, label });
			}
		);

		const outcome = await opener.open(4, 'project-a', 'definition-a');

		assert.strictEqual(outcome.status, 'opened');
		assert.strictEqual(outcome.status === 'opened' ? outcome.resource.assetId : undefined, 'definition-a');
		assert.strictEqual(opened[0].viewType, 'jscene3d.sceneDefinition');
		assert.strictEqual(opened[0].label, 'Main');
		assert.strictEqual(new URL(opened[0].resource).searchParams.get('jscene3dProjectId'), 'project-a');
		assert.strictEqual(new URL(opened[0].resource).searchParams.has('jscene3dGeneration'), false);
	});

	test('keeps an EntityDefinition in the generic authored-definition editor', async () => {
		const state = new AuthoredDefinitionState();
		state.setProjectGeneration(4);
		const opened: Array<{ resource: string; viewType: string; label: string }> = [];
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => connected(success(4, definition('definition-a', 'entity-definition', 'Crate'))) },
			state,
			async (resource, viewType, label) => { opened.push({ resource, viewType, label }); }
		);

		await opener.open(4, 'project-a', 'definition-a');

		assert.strictEqual(opened[0].viewType, authoredDefinitionViewType);
		assert.strictEqual(opened[0].label, 'Crate');
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

		const outcome = await opener.open(4, 'project-a', 'definition-a');

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

		await assert.rejects(opener.open(4, 'project-a', 'definition-a'), /does not match/);
		assert.strictEqual(openCalls, 0);
	});

	test('focuses the recovered hot-exit resource instead of opening a duplicate current-session URI', async () => {
		const state = new AuthoredDefinitionState();
		const snapshot = definition('definition-a');
		const recoveredResource = definitionResourceUri('project-a', snapshot);
		state.setProjectGeneration(4);
		state.register(recoveredResource, 4, snapshot);
		const opened: string[] = [];
		const opener = new AuthoredDefinitionOpener(
			{ openDefinition: async () => connected(success(4, snapshot), 'connection-after-restart') },
			state,
			async resource => { opened.push(resource); }
		);

		const outcome = await opener.open(4, 'project-a', 'definition-a');

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

function definition(
	assetId: string,
	kind: 'scene-definition' | 'entity-definition' = 'scene-definition',
	label = 'World'
): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId,
			kind,
			origin: 'authored',
			editable: true,
			source: 'file:///projects/game/worlds/main.scene.json',
			label: { kind: 'literal', text: label, messageCode: null, arguments: [] }
		},
		roots: []
	};
}
