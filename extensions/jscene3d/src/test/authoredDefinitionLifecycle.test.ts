/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	AuthoredDefinitionLifecycle,
	AuthoredDefinitionLifecycleClient
} from '../definition/authoredDefinitionLifecycle';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import {
	ConnectionScopedResult,
	DefinitionBackupResultDto,
	DefinitionMutationDto,
	DefinitionOpenResultDto,
	DefinitionOperationResultDto,
	DefinitionSnapshotDto,
	InspectorMutationTargetDto
} from '../protocol/authoringProtocol';

suite('JScene3D authored definition lifecycle', () => {
	test('accepted mutation refreshes Java authority and creates callbacks for native undo and redo', async () => {
		const state = activeState();
		const client = new TestLifecycleClient();
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, () => undefined);

		const outcome = await lifecycle.mutate(target, {
			operation: 'set', value: { kind: 'number', literal: '12345678901234567890.00000000000000000001' }
		}, 'Edit Speed');

		assert.strictEqual(outcome.status, 'accepted');
		assert.deepStrictEqual(client.mutations[0].mutation, {
			operation: 'set', value: { kind: 'number', literal: '12345678901234567890.00000000000000000001' }
		});
		assert.strictEqual(state.active?.snapshot.revision, 1);
		if (outcome.status === 'accepted') {
			await outcome.edit.undo();
			await outcome.edit.redo();
		}
		assert.deepStrictEqual(client.history, ['undo:1', 'redo:2']);
		assert.strictEqual(state.active?.snapshot.revision, 3);
	});

	test('validation rejection publishes diagnostics without refresh or edit', async () => {
		const state = activeState();
		const client = new TestLifecycleClient();
		client.nextMutation = operation('validation-rejected', 0, false, [diagnostic]);
		const published: unknown[] = [];
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, diagnostics => published.push(diagnostics));

		const outcome = await lifecycle.mutate(target, {
			operation: 'set', value: { kind: 'number', literal: '-1' }
		}, 'Edit Speed');

		assert.deepStrictEqual(outcome, {
			status: 'rejected', outcome: 'validation-rejected', diagnostics: [diagnostic]
		});
		assert.strictEqual(client.openCalls, 0);
		assert.strictEqual(state.active?.snapshot.revision, 0);
		assert.deepStrictEqual(published, [[diagnostic]]);
	});

	test('stale mutation rereads authority but creates no native edit', async () => {
		const state = activeState();
		const client = new TestLifecycleClient();
		client.nextMutation = operation('stale-revision', 4, true);
		client.nextRevision = 4;
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, () => undefined);

		const outcome = await lifecycle.mutate(target, {
			operation: 'set', value: { kind: 'boolean', value: false }
		}, 'Disable Player');

		assert.strictEqual(outcome.status, 'rejected');
		assert.strictEqual(client.openCalls, 1);
		assert.strictEqual(state.active?.snapshot.revision, 4);
	});

	test('delegates save, revert, backup, and restore to Java and refreshes authoritative state', async () => {
		const state = activeState();
		const client = new TestLifecycleClient();
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, () => undefined);

		await lifecycle.save(resource);
		await lifecycle.revert(resource);
		const backup = await lifecycle.backup(resource);
		await lifecycle.restore(resource, backup);

		assert.deepStrictEqual(client.lifecycle, ['save:0', 'revert:0', 'backup:1', 'restore:1:e30=']);
		assert.strictEqual(backup, 'e30=');
		assert.strictEqual(client.openCalls, 3);
		assert.strictEqual(state.active?.snapshot.revision, 2);
	});

	test('recovers opaque backup into a new project generation without old history', async () => {
		const state = activeState();
		state.setProjectGeneration(8);
		const client = new TestLifecycleClient();
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, () => undefined);

		await lifecycle.recover(resource, 8, 'world-a', 'cmVjb3Zlcnk=');

		assert.deepStrictEqual(client.lifecycle, ['restore:0:cmVjb3Zlcnk=']);
		assert.strictEqual(state.resolve(resource)?.projectGeneration, 8);
		assert.strictEqual(state.resolve(resource)?.snapshot.revision, 1);
	});

	test('rebinds a clean restored editor by current generation and stable AssetId', async () => {
		const state = activeState();
		state.setProjectGeneration(8);
		const client = new TestLifecycleClient();
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, () => undefined);

		await lifecycle.reopen(resource, 8, 'world-a');

		assert.strictEqual(client.openCalls, 1);
		assert.strictEqual(state.resolve(resource)?.projectGeneration, 8);
		assert.strictEqual(state.resolve(resource)?.assetId, 'world-a');
	});

	test('never creates editable lifecycle behavior for generated definitions', async () => {
		const state = activeState(false);
		const client = new TestLifecycleClient();
		const lifecycle = new AuthoredDefinitionLifecycle(client, state, () => undefined);

		await assert.rejects(lifecycle.mutate(target, {
			operation: 'set', value: { kind: 'text', literal: 'forbidden' }
		}, 'Edit generated'), /read-only/);
		await assert.rejects(lifecycle.backup(resource), /do not support recovery backup/);

		assert.deepStrictEqual(client.mutations, []);
		assert.deepStrictEqual(client.lifecycle, []);
	});
});

class TestLifecycleClient implements AuthoredDefinitionLifecycleClient {
	readonly mutations: { readonly mutation: DefinitionMutationDto }[] = [];
	readonly history: string[] = [];
	readonly lifecycle: string[] = [];
	openCalls = 0;
	nextRevision = 0;
	nextMutation: DefinitionOperationResultDto = operation('accepted', 1, true);

	openDefinition(projectGeneration: number): Promise<ConnectionScopedResult<DefinitionOpenResultDto>> {
		this.openCalls++;
		return Promise.resolve({
			connectionGeneration: 'connection-a',
			result: {
				opened: true, projectGeneration, definition: snapshot(this.nextRevision), diagnostics: [], failureCode: null
			}
		});
	}

	mutateDefinition(
		_projectGeneration: number,
		_assetId: string,
		_revision: number,
		_target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto
	): Promise<DefinitionOperationResultDto> {
		this.mutations.push({ mutation });
		this.nextRevision = this.nextMutation.revision;
		return Promise.resolve(this.nextMutation);
	}

	undoDefinition(_projectGeneration: number, _assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		this.history.push(`undo:${revision}`);
		this.nextRevision = revision + 1;
		return Promise.resolve(operation('accepted', this.nextRevision, false));
	}

	redoDefinition(_projectGeneration: number, _assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		this.history.push(`redo:${revision}`);
		this.nextRevision = revision + 1;
		return Promise.resolve(operation('accepted', this.nextRevision, true));
	}

	saveDefinition(_projectGeneration: number, _assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		this.lifecycle.push(`save:${revision}`);
		return Promise.resolve(operation('saved', this.nextRevision, false));
	}

	revertDefinition(_projectGeneration: number, _assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		this.lifecycle.push(`revert:${revision}`);
		return Promise.resolve(operation('reverted', ++this.nextRevision, false));
	}

	backupDefinition(_projectGeneration: number, _assetId: string, revision: number): Promise<DefinitionBackupResultDto> {
		this.lifecycle.push(`backup:${revision}`);
		return Promise.resolve({ ...operation('backed-up', this.nextRevision, true), backup: 'e30=' });
	}

	restoreDefinitionBackup(
		_projectGeneration: number,
		_assetId: string,
		revision: number,
		backup: string
	): Promise<DefinitionOperationResultDto> {
		this.lifecycle.push(`restore:${revision}:${backup}`);
		return Promise.resolve(operation('restored', ++this.nextRevision, true));
	}
}

const resource = 'file:///project/worlds/main.scene.json?document=a';

function activeState(editable = true): AuthoredDefinitionState {
	const state = new AuthoredDefinitionState();
	state.setProjectGeneration(7);
	state.register(resource, 7, snapshot(0, editable));
	state.activate(resource);
	return state;
}

function snapshot(revision: number, editable = true): DefinitionSnapshotDto {
	return {
		revision,
		context: {
			assetId: 'world-a', kind: 'scene-definition', origin: editable ? 'authored' : 'generated', editable,
			source: 'file:///project/worlds/main.scene.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: []
	};
}

function operation(
	outcome: string,
	revision: number,
	dirty: boolean,
	diagnostics: DefinitionOperationResultDto['diagnostics'] = []
): DefinitionOperationResultDto {
	return { definition: 'world-a', outcome, revision, dirty, canUndo: dirty, canRedo: false, diagnostics };
}

const target: InspectorMutationTargetDto = {
	kind: 'component-property',
	occurrence: { definitionAssetId: 'world-a', entityPath: ['entity-a'] },
	entityId: 'entity-a', componentId: 'component-a', propertyId: 'speed'
};

const diagnostic = {
	severity: 'error' as const,
	code: 'asset.component.property.range',
	message: 'Value is below the minimum',
	source: 'file:///project/worlds/main.scene.json',
	location: '/roots/0/components/0/properties/speed',
	details: {}
};
