/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DefinitionMutationOutcome } from '../definition/authoredDefinitionLifecycle';
import { AuthoredDefinitionResource, HierarchySelection } from '../definition/authoredDefinitionState';
import {
	InspectorDefinitionEditor,
	InspectorEditCoordinator,
	InspectorEditFeedback
} from '../inspector/inspectorEditCoordinator';
import { InspectorStateSnapshot } from '../inspector/inspectorState';
import {
	DefinitionMutationDto,
	DefinitionMutationValueDto,
	InspectorMutationTargetDto,
	InspectorPropertyDto,
	InspectorSnapshotDto
} from '../protocol/authoringProtocol';

suite('JScene3D Inspector edit coordinator', () => {
	test('delegates supported candidates with Java-issued targets and stable labels', async () => {
		const fixture = editFixture();
		for (const request of [
			requestFor('entity', 'enabled', { kind: 'boolean', value: false }),
			requestFor('details', 'label', { kind: 'text', literal: 'Renamed' }),
			requestFor('details', 'priority', { kind: 'integer', literal: '3' }),
			requestFor('transform', 'position', { kind: 'number-array', literals: ['4', '5', '6'] })
		]) {
			await fixture.coordinator.edit(request, inspector => fixture.refreshes.push(inspector));
		}

		assert.deepStrictEqual(fixture.editor.calls.map(call => ({
			target: call.target,
			mutation: call.mutation,
			label: call.label
		})), [
			{ target: entityTarget(), mutation: set({ kind: 'boolean', value: false }), label: 'Edit Enabled' },
			{ target: componentTarget('details', 'label'), mutation: set({ kind: 'text', literal: 'Renamed' }), label: 'Edit Label' },
			{ target: componentTarget('details', 'priority'), mutation: set({ kind: 'integer', literal: '3' }), label: 'Edit Priority' },
			{
				target: componentTarget('transform', 'position'),
				mutation: set({ kind: 'number-array', literals: ['4', '5', '6'] }),
				label: 'Edit Position'
			}
		]);
		assert.deepStrictEqual(fixture.feedback.rejections, []);
		assert.deepStrictEqual(fixture.feedback.failures, []);
		assert.deepStrictEqual(fixture.refreshes, Array(4).fill(fixture.inspector));
	});

	test('rejects missing, read-only, incompatible, unsupported, and forged properties before mutation', async () => {
		const fixture = editFixture();
		const invalidRequests = [
			requestFor('missing', 'position', { kind: 'number-array', literals: ['1', '2', '3'] }),
			requestFor('transform', 'missing', { kind: 'number-array', literals: ['1', '2', '3'] }),
			requestFor('transform', 'readOnly', { kind: 'number-array', literals: ['1', '2', '3'] }),
			requestFor('transform', 'inherited', { kind: 'number-array', literals: ['1', '2', '3'] }),
			requestFor('transform', 'missingTarget', { kind: 'number-array', literals: ['1', '2', '3'] }),
			requestFor('transform', 'position', { kind: 'text', literal: 'forged' }),
			requestFor('transform', 'position', { kind: 'number-array', literals: ['1', '-', '3'] }),
			requestFor('details', 'resource', { kind: 'text', literal: 'forged' }),
			requestFor('transform', 'forgedTarget', { kind: 'number-array', literals: ['1', '2', '3'] })
		];

		for (const request of invalidRequests) {
			await fixture.coordinator.edit(request, inspector => fixture.refreshes.push(inspector));
		}

		assert.deepStrictEqual(fixture.editor.calls, []);
		assert.deepStrictEqual(fixture.refreshes, Array(invalidRequests.length).fill(fixture.inspector));
	});

	test('requires the current selection, project generation, asset, and revision context', async () => {
		const variants = [
			{ snapshot: { status: 'empty' } as const },
			{ context: { active: undefined, selection: undefined } },
			{ context: context({ projectGeneration: 2 }) },
			{ context: context({ assetId: 'scene-b' }) },
			{ context: context({ revision: 3 }) },
			{ context: context({ selectionIdentity: 'other' }) }
		];

		for (const variant of variants) {
			const fixture = editFixture(variant);
			await fixture.coordinator.edit(
				requestFor('transform', 'position', { kind: 'number-array', literals: ['4', '5', '6'] }),
				inspector => fixture.refreshes.push(inspector)
			);
			assert.deepStrictEqual(fixture.editor.calls, []);
			assert.strictEqual(fixture.refreshes.length, 1);
		}
	});

	test('reports Java rejection and transport failure without manufacturing state', async () => {
		const rejected = editFixture({ outcome: { status: 'rejected', outcome: 'invalid-value', diagnostics: [] } });
		await rejected.coordinator.edit(
			requestFor('transform', 'position', { kind: 'number-array', literals: ['4', '5', '6'] }),
			inspector => rejected.refreshes.push(inspector)
		);
		assert.deepStrictEqual(rejected.feedback.rejections, [{ label: 'Edit Position', reason: 'invalid-value' }]);
		assert.strictEqual(rejected.refreshes[0], rejected.inspector);

		const failed = editFixture({ failure: new Error('connection closed') });
		await failed.coordinator.edit(
			requestFor('transform', 'position', { kind: 'number-array', literals: ['4', '5', '6'] }),
			inspector => failed.refreshes.push(inspector)
		);
		assert.deepStrictEqual(failed.feedback.failures, ['connection closed']);
		assert.strictEqual(failed.refreshes[0], failed.inspector);
	});

	test('treats an authoritative no-op as settled without feedback or duplicate work', async () => {
		const fixture = editFixture({ outcome: { status: 'noOp' } });
		await fixture.coordinator.edit(
			requestFor('transform', 'position', { kind: 'number-array', literals: ['1', '2', '3'] }),
			inspector => fixture.refreshes.push(inspector)
		);

		assert.strictEqual(fixture.editor.calls.length, 1);
		assert.deepStrictEqual(fixture.feedback.rejections, []);
		assert.deepStrictEqual(fixture.feedback.failures, []);
		assert.deepStrictEqual(fixture.refreshes, [fixture.inspector]);
	});

	test('keeps a submitted mutation on its original target across selection changes', async () => {
		const pending = deferred<DefinitionMutationOutcome>();
		const fixture = editFixture({ pending });
		const edit = fixture.coordinator.edit(
			requestFor('transform', 'position', { kind: 'number-array', literals: ['4', '5', '6'] }),
			inspector => fixture.refreshes.push(inspector)
		);
		fixture.state.snapshot = readyState(inspectorSnapshot('Other'), context({ selectionIdentity: 'other' }).selection!);
		pending.resolve(accepted());
		await edit;

		assert.strictEqual(fixture.editor.calls.length, 1);
		assert.deepStrictEqual(fixture.editor.calls[0].target, componentTarget('transform', 'position'));
		assert.strictEqual(fixture.refreshes[0], fixture.inspector);
	});

	test('does not refresh or report a delayed completion after disposal', async () => {
		const pending = deferred<DefinitionMutationOutcome>();
		const fixture = editFixture({ pending });
		const edit = fixture.coordinator.edit(
			requestFor('transform', 'position', { kind: 'number-array', literals: ['4', '5', '6'] }),
			inspector => fixture.refreshes.push(inspector)
		);
		fixture.coordinator.dispose();
		pending.resolve({ status: 'rejected', outcome: 'stale-revision', diagnostics: [] });
		await edit;

		assert.deepStrictEqual(fixture.feedback.rejections, []);
		assert.deepStrictEqual(fixture.refreshes, []);
	});
});

class TestEditor implements InspectorDefinitionEditor {
	readonly calls: Array<{
		readonly target: InspectorMutationTargetDto;
		readonly mutation: DefinitionMutationDto;
		readonly label: string;
	}> = [];

	constructor(
		private readonly outcome: DefinitionMutationOutcome,
		private readonly failure?: Error,
		private readonly pending?: Deferred<DefinitionMutationOutcome>
	) { }

	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		this.calls.push({ target, mutation, label });
		if (this.failure !== undefined) {
			return Promise.reject(this.failure);
		}
		return this.pending?.promise ?? Promise.resolve(this.outcome);
	}
}

class TestFeedback implements InspectorEditFeedback {
	readonly rejections: Array<{ readonly label: string; readonly reason: string }> = [];
	readonly failures: string[] = [];

	rejected(label: string, reason: string): Promise<void> {
		this.rejections.push({ label, reason });
		return Promise.resolve();
	}

	failed(error: unknown): Promise<void> {
		this.failures.push(error instanceof Error ? error.message : String(error));
		return Promise.resolve();
	}
}

class TestInspectorState {
	constructor(public snapshot: InspectorStateSnapshot) { }
}

function editFixture(options: {
	readonly snapshot?: InspectorStateSnapshot;
	readonly context?: TestContext;
	readonly outcome?: DefinitionMutationOutcome;
	readonly failure?: Error;
	readonly pending?: Deferred<DefinitionMutationOutcome>;
} = {}) {
	const inspector = options.snapshot?.status === 'ready' ? options.snapshot.inspector : inspectorSnapshot('Cube');
	const currentContext = options.context ?? context();
	const state = new TestInspectorState(options.snapshot ?? readyState(inspector, context().selection!));
	const editor = new TestEditor(options.outcome ?? accepted(), options.failure, options.pending);
	const feedback = new TestFeedback();
	const coordinator = new InspectorEditCoordinator(state, currentContext, editor, feedback);
	return { coordinator, state, editor, feedback, inspector, refreshes: [] as Array<InspectorSnapshotDto | undefined> };
}

interface TestContext {
	readonly active: AuthoredDefinitionResource | undefined;
	readonly selection: HierarchySelection | undefined;
}

function context(options: {
	readonly projectGeneration?: number;
	readonly assetId?: string;
	readonly revision?: number;
	readonly selectionIdentity?: string;
} = {}): TestContext {
	const projectGeneration = options.projectGeneration ?? 1;
	const assetId = options.assetId ?? 'scene-a';
	const identity = options.selectionIdentity ?? 'cube';
	const occurrence = { definitionAssetId: assetId, entityPath: [identity] };
	const target = { kind: 'local-entity' as const, source: 'file:///scene.json', identity, occurrence };
	return {
		active: {
			resource: 'jscene3d-definition:/scene-a', projectGeneration, assetId,
			snapshot: { revision: options.revision ?? 2, context: definitionContext(assetId), roots: [] }
		},
		selection: { projectGeneration, assetId, occurrence, target }
	};
}

function readyState(inspector: InspectorSnapshotDto, selection: HierarchySelection): InspectorStateSnapshot {
	return { status: 'ready', selection, inspector, selectedGroupId: 'entity' };
}

function inspectorSnapshot(title: string): InspectorSnapshotDto {
	const occurrence = { definitionAssetId: 'scene-a', entityPath: ['cube'] };
	const target = { kind: 'local-entity' as const, source: 'file:///scene.json', identity: 'cube', occurrence };
	return {
		revision: 2, target, title, definitionOrigin: 'authored', provenance: 'local', editable: true,
		groups: [
			group('entity', 'entity', null, [property('enabled', 'Enabled', 'boolean', 'default', true, entityTarget())]),
			group('details', 'component', 'details', [
				property('label', 'Label', 'text', 'default', true, componentTarget('details', 'label')),
				property('priority', 'Priority', 'number', 'integer', true, componentTarget('details', 'priority')),
				property('resource', 'Resource', 'reference', 'default', true, componentTarget('details', 'resource'))
			]),
			group('transform', 'component', 'transform', [
				property('position', 'Position', 'array', 'vector3', true, componentTarget('transform', 'position')),
				property('readOnly', 'Read Only', 'array', 'vector3', false, componentTarget('transform', 'readOnly'), 'authored'),
				property('inherited', 'Inherited', 'array', 'vector3', false, null),
				property('missingTarget', 'Missing Target', 'array', 'vector3', true, null),
				property('forgedTarget', 'Forged', 'array', 'vector3', true, componentTarget('other', 'forgedTarget'))
			])
		]
	};
}

function group(
	identity: string,
	kind: 'entity' | 'component',
	componentId: string | null,
	properties: readonly InspectorPropertyDto[]
) {
	return {
		identity, kind, label: identity, description: null, componentId, componentType: null,
		metadataStatus: 'available' as const, editable: true, properties
	};
}

function property(
	identity: string,
	label: string,
	valueKind: InspectorPropertyDto['valueKind'],
	semantic: InspectorPropertyDto['constraints']['editor']['semantic'],
	editable: boolean,
	mutationTarget: InspectorMutationTargetDto | null,
	origin: InspectorPropertyDto['state']['origin'] = editable ? 'authored' : 'default'
): InspectorPropertyDto {
	return {
		identity, label, description: null, valueKind, required: true,
		constraints: {
			elementKind: valueKind === 'array' ? 'number' : null,
			exactElementCount: valueKind === 'array' ? 3 : null,
			acceptedReferenceKinds: [], editor: { semantic, minimum: null, maximum: null }
		},
		state: {
			authoredValue: null, defaultValue: null, effectiveValue: null,
			origin, validity: 'valid', editable, modified: false
		},
		mutationTarget
	};
}

function entityTarget(): InspectorMutationTargetDto {
	return {
		kind: 'entity-enabled', occurrence: { definitionAssetId: 'scene-a', entityPath: ['cube'] }, entityId: 'cube'
	};
}

function componentTarget(componentId: string, propertyId: string): InspectorMutationTargetDto {
	return {
		kind: 'component-property', occurrence: { definitionAssetId: 'scene-a', entityPath: ['cube'] },
		entityId: 'cube', componentId, propertyId
	};
}

function requestFor(groupId: string, propertyId: string, candidate: DefinitionMutationValueDto) {
	return { groupId, propertyId, candidate };
}

function set(value: DefinitionMutationValueDto): DefinitionMutationDto {
	return { operation: 'set', value };
}

function accepted(): DefinitionMutationOutcome {
	return {
		status: 'accepted',
		edit: { label: 'ignored by coordinator', undo: () => Promise.resolve(), redo: () => Promise.resolve() }
	};
}

function definitionContext(assetId: string) {
	return {
		assetId, kind: 'scene-definition' as const, origin: 'authored' as const, editable: true,
		source: 'file:///scene.json', label: { kind: 'literal' as const, text: 'Scene', messageCode: null, arguments: [] }
	};
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
