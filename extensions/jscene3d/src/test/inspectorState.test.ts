/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { InspectorReader, InspectorState } from '../inspector/inspectorState';
import {
	DefinitionSnapshotDto,
	HierarchyNodeDto,
	HierarchySemanticTargetDto,
	InspectorReadResultDto,
	InspectorSnapshotDto
} from '../protocol/authoringProtocol';

suite('JScene3D Inspector state', () => {
	test('clears when Hierarchy selection clears or the project generation is invalidated', async () => {
		const definitions = activeDefinitions();
		const reader = new ImmediateReader();
		const state = new InspectorState(reader, definitions);
		definitions.select(definitions.active!.snapshot.roots[0]);
		await settled();
		assert.strictEqual(state.snapshot.status, 'ready');

		definitions.clearSelection();
		const cleared = state.snapshot;
		assert.strictEqual(cleared.status, 'empty');
		definitions.setProjectGeneration(undefined);
		const invalidated = state.snapshot;
		assert.strictEqual(invalidated.status, 'empty');
	});

	test('prevents an older response from replacing a newer selection', async () => {
		const definitions = activeDefinitions();
		const reader = new DeferredReader();
		const state = new InspectorState(reader, definitions);
		const [first, second] = definitions.active!.snapshot.roots;
		definitions.select(first);
		definitions.select(second);
		assert.strictEqual(reader.requests.length, 2);

		reader.requests[1].resolve(success(second.target, 'Second'));
		await settled();
		assert.strictEqual(state.snapshot.status, 'ready');
		assert.strictEqual(state.snapshot.status === 'ready' ? state.snapshot.inspector.title : '', 'Second');

		reader.requests[0].resolve(success(first.target, 'First'));
		await settled();
		assert.strictEqual(state.snapshot.status === 'ready' ? state.snapshot.inspector.title : '', 'Second');
	});

	test('defaults to Entity and preserves an existing group only for the same target', async () => {
		const definitions = activeDefinitions();
		const reader = new DeferredReader();
		const state = new InspectorState(reader, definitions);
		const [first, second] = definitions.active!.snapshot.roots;
		definitions.select(first);
		reader.requests[0].resolve(success(first.target, 'First'));
		await settled();
		assert.strictEqual(state.snapshot.status === 'ready' ? state.snapshot.selectedGroupId : '', 'entity');
		state.selectGroup('component-a');

		definitions.select(first);
		reader.requests[1].resolve(success(first.target, 'First refreshed'));
		await settled();
		assert.strictEqual(state.snapshot.status === 'ready' ? state.snapshot.selectedGroupId : '', 'component-a');

		definitions.select(second);
		reader.requests[2].resolve(success(second.target, 'Second'));
		await settled();
		assert.strictEqual(state.snapshot.status === 'ready' ? state.snapshot.selectedGroupId : '', 'entity');
	});
});

class ImmediateReader implements InspectorReader {
	readInspector(
		expectedProjectGeneration: number,
		expectedDefinitionRevision: number,
		target: HierarchySemanticTargetDto
	): Promise<InspectorReadResultDto> {
		return Promise.resolve(success(target, target.identity, expectedProjectGeneration, expectedDefinitionRevision));
	}
}

class DeferredReader implements InspectorReader {
	readonly requests: Deferred<InspectorReadResultDto>[] = [];

	readInspector(): Promise<InspectorReadResultDto> {
		const request = deferred<InspectorReadResultDto>();
		this.requests.push(request);
		return request.promise;
	}
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(accept => resolve = accept);
	return { promise, resolve };
}

function activeDefinitions(): AuthoredDefinitionState {
	const definitions = new AuthoredDefinitionState();
	const snapshot = definition();
	definitions.setProjectGeneration(7);
	definitions.register('jscene3d-definition:/world-a', 7, snapshot);
	definitions.activate('jscene3d-definition:/world-a');
	return definitions;
}

function definition(): DefinitionSnapshotDto {
	return {
		revision: 4,
		context: {
			assetId: 'world-a', kind: 'scene-definition', origin: 'authored', editable: true,
			source: 'file:///world.json', label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: [node('entity-a', 'First'), node('entity-b', 'Second')]
	};
}

function node(identity: string, label: string): HierarchyNodeDto {
	const occurrence = { definitionAssetId: 'world-a', entityPath: [identity] };
	return {
		occurrence, kind: 'local-entity', entityId: identity, definitionId: null,
		label: { kind: 'literal', text: label, messageCode: null, arguments: [] },
		enabled: true, modified: false, editable: true,
		target: { kind: 'local-entity', source: 'file:///world.json', identity, occurrence }, children: []
	};
}

function success(
	target: HierarchySemanticTargetDto,
	title: string,
	projectGeneration = 7,
	revision = 4
): InspectorReadResultDto {
	return {
		read: true, projectGeneration, snapshot: inspector(target, title, revision), diagnostics: [], failureCode: null
	};
}

function inspector(target: HierarchySemanticTargetDto, title: string, revision: number): InspectorSnapshotDto {
	return {
		revision, target, title, definitionOrigin: 'authored', provenance: 'local', editable: true,
		groups: [group('entity', 'entity', 'Entity'), group('component-a', 'component', 'Movement')]
	};
}

function group(
	identity: string,
	kind: 'entity' | 'component',
	label: string
): InspectorSnapshotDto['groups'][number] {
	return {
		identity, kind, label, description: null,
		componentId: kind === 'component' ? identity : null,
		componentType: kind === 'component' ? { id: 'example/movement', version: 1 } : null,
		metadataStatus: 'available', editable: true, properties: []
	};
}

async function settled(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
