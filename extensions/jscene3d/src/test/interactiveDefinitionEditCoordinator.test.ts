/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AcceptedDefinitionEdit, DefinitionMutationOutcome } from '../definition/authoredDefinitionLifecycle';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import {
	InteractiveDefinitionEditCoordinator,
	InteractiveDefinitionEditLifecycle
} from '../definition/interactiveDefinitionEditCoordinator';
import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';
import { SceneTransformEditEvent } from '../sceneView/sceneViewRegistration';

suite('JScene3D interactive definition edit coordinator', () => {
	test('coalesces only pending previews while preserving begin and terminal ordering', async () => {
		const state = activeState();
		const lifecycle = new TestInteractiveLifecycle();
		const edits: AcceptedDefinitionEdit[] = [];
		const coordinator = new InteractiveDefinitionEditCoordinator(
			lifecycle, state, async (_resource, edit) => { edits.push(edit); });
		lifecycle.pauseBegin();

		const begin = coordinator.accept(event('begin', ['0', '0', '0']));
		const first = coordinator.accept(event('update', ['1', '0', '0']));
		const second = coordinator.accept(event('update', ['2', '0', '0']));
		const third = coordinator.accept(event('update', ['3', '0', '0']));
		const commit = coordinator.accept(event('commit', ['3', '0', '0']));
		lifecycle.resumeBegin();

		assert.deepStrictEqual(await Promise.all([begin, first, second, third, commit]),
			[true, true, true, true, true]);
		assert.deepStrictEqual(lifecycle.calls.map(call => `${call.phase}:${call.literals?.[0] ?? '-'}`),
			['begin:-', 'update:3', 'commit:-']);
		assert.strictEqual(edits.length, 1);
	});

	test('cancels an authoritative transaction after a rejected preview', async () => {
		const state = activeState();
		const lifecycle = new TestInteractiveLifecycle();
		lifecycle.rejectUpdates = true;
		const coordinator = new InteractiveDefinitionEditCoordinator(lifecycle, state, async () => undefined);

		assert.strictEqual(await coordinator.accept(event('begin', ['0', '0', '0'])), true);
		assert.strictEqual(await coordinator.accept(event('update', ['1', '0', '0'])), false);
		assert.deepStrictEqual(lifecycle.calls.map(call => call.phase), ['begin', 'update', 'cancel']);
		assert.strictEqual(await coordinator.accept(event('cancel', ['0', '0', '0'])), true);
	});

	test('cancels active edits before a document or project closes', async () => {
		const state = activeState();
		const lifecycle = new TestInteractiveLifecycle();
		const coordinator = new InteractiveDefinitionEditCoordinator(lifecycle, state, async () => undefined);

		await coordinator.accept(event('begin', ['0', '0', '0']));
		await coordinator.cancelAll();

		assert.deepStrictEqual(lifecycle.calls.map(call => call.phase), ['begin', 'cancel']);
	});
});

interface RecordedCall {
	readonly phase: 'begin' | 'update' | 'commit' | 'cancel';
	readonly literals?: readonly string[];
}

class TestInteractiveLifecycle implements InteractiveDefinitionEditLifecycle {
	readonly calls: RecordedCall[] = [];
	rejectUpdates = false;
	private beginGate: Deferred<void> | undefined;

	pauseBegin(): void {
		this.beginGate = deferred<void>();
	}

	resumeBegin(): void {
		this.beginGate?.resolve(undefined);
	}

	async interact(
		_resource: string,
		_target: Parameters<InteractiveDefinitionEditLifecycle['interact']>[1],
		phase: RecordedCall['phase'],
		_editId: string,
		value?: { readonly kind: 'number-array'; readonly literals: readonly string[] }
	): Promise<DefinitionMutationOutcome> {
		this.calls.push({ phase, literals: value?.literals });
		if (phase === 'begin') {
			await this.beginGate?.promise;
		}
		if (phase === 'update' && this.rejectUpdates) {
			return { status: 'rejected', outcome: 'validation-rejected', diagnostics: [] };
		}
		if (phase === 'commit') {
			return { status: 'accepted', edit: { label: 'Transform entity', undo: async () => undefined, redo: async () => undefined } };
		}
		return { status: 'noOp' };
	}

	reconcile(): Promise<void> {
		return Promise.resolve();
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

function activeState(): AuthoredDefinitionState {
	const state = new AuthoredDefinitionState();
	state.setProjectGeneration(7);
	state.register('file:///main.scene.json?document=a', 7, snapshot());
	state.activate('file:///main.scene.json?document=a');
	return state;
}

function snapshot(): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId: 'scene-a', kind: 'scene-definition', origin: 'authored', editable: true,
			source: 'file:///main.scene.json',
			label: { kind: 'literal', text: 'Main', messageCode: null, arguments: [] }
		},
		roots: []
	};
}

function event(
	phase: SceneTransformEditEvent['phase'],
	literals: readonly [string, string, string]
): SceneTransformEditEvent {
	return {
		phase,
		editId: 'drag-a',
		revision: 0,
		definitionAssetId: 'scene-a',
		entityPath: ['entity-a'],
		authoredDefinitionAssetId: 'scene-a',
		authoredEntityId: 'entity-a',
		componentId: 'transform-a',
		propertyId: 'position',
		literals
	};
}
