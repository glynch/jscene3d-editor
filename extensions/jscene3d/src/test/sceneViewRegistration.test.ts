/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { HierarchyNodeDto, HierarchyOccurrenceDto } from '../protocol/authoringProtocol';
import { ResolvedSceneViewSelection, SceneViewSelectionEvent, SceneViewSynchronizationOutcome } from '../sceneView/sceneViewLifecycle';
import { SceneViewRegistration } from '../sceneView/sceneViewRegistration';

suite('JScene3D Scene View feature registration', () => {
	test('synchronizes the active Scene when its authoritative snapshot changes', async () => {
		const state = new AuthoredDefinitionState();
		const lifecycle = new TestLifecycle();
		const registration = new SceneViewRegistration(state, lifecycle, new TestLogger());
		state.setProjectGeneration(7);
		state.register('scene-resource', 7, snapshot('scene-a', 0));
		state.activate('scene-resource');

		state.update('scene-resource', snapshot('scene-a', 1));
		await Promise.resolve();

		assert.deepStrictEqual(lifecycle.synchronized.map(definition => definition.snapshot.revision), [1]);
		registration.dispose();
	});

	test('owns close delegation and stops observing definition state when disposed', async () => {
		const state = new AuthoredDefinitionState();
		const lifecycle = new TestLifecycle();
		const registration = new SceneViewRegistration(state, lifecycle, new TestLogger());
		state.setProjectGeneration(7);
		state.register('scene-resource', 7, snapshot('scene-a', 0));
		state.activate('scene-resource');

		await registration.close('scene-resource');
		registration.dispose();
		await registration.closeAll();
		await Promise.resolve();
		state.update('scene-resource', snapshot('scene-a', 1));
		await Promise.resolve();

		assert.deepStrictEqual(lifecycle.closed, ['scene-resource']);
		assert.strictEqual(lifecycle.closeAllCount, 1);
		assert.deepStrictEqual(lifecycle.synchronized, []);
	});

	test('uses authored definition state as the shared Hierarchy and Scene View selection', async () => {
		const state = new AuthoredDefinitionState();
		const lifecycle = new TestLifecycle();
		const registration = new SceneViewRegistration(state, lifecycle, new TestLogger());
		const current = snapshot('scene-a', 0, ['environment', 'crate']);
		state.setProjectGeneration(7);
		state.register('scene-resource', 7, current);
		state.activate('scene-resource');

		state.select(current.roots[0].children[0]);
		await Promise.resolve();
		lifecycle.resolved = {
			resource: 'scene-resource',
			occurrence: current.roots[0].occurrence
		};
		assert.strictEqual(registration.acceptSelection(selectionEvent()), true);

		assert.deepStrictEqual({
			forwarded: lifecycle.selected,
			selected: state.selection?.occurrence
		}, {
			forwarded: [{
				definition: 'scene-a',
				occurrence: { definitionAssetId: 'scene-a', entityPath: ['environment', 'crate'] }
			}, {
				definition: 'scene-a',
				occurrence: { definitionAssetId: 'scene-a', entityPath: ['environment'] }
			}],
			selected: { definitionAssetId: 'scene-a', entityPath: ['environment'] }
		});
		registration.dispose();
	});

	test('rejects stale native selection without changing the shared selection', () => {
		const state = new AuthoredDefinitionState();
		const lifecycle = new TestLifecycle();
		const registration = new SceneViewRegistration(state, lifecycle, new TestLogger());
		const current = snapshot('scene-a', 0, ['crate']);
		state.setProjectGeneration(7);
		state.register('scene-resource', 7, current);
		state.activate('scene-resource');
		state.select(current.roots[0]);

		assert.strictEqual(registration.acceptSelection(selectionEvent()), false);
		assert.deepStrictEqual(state.selection?.occurrence, current.roots[0].occurrence);
		registration.dispose();
	});
});

class TestLifecycle {
	readonly synchronized: AuthoredDefinitionResource[] = [];
	readonly closed: string[] = [];
	readonly selected: { definition: string; occurrence: HierarchyOccurrenceDto | null }[] = [];
	resolved: ResolvedSceneViewSelection | undefined;
	closeAllCount = 0;

	synchronize(definition: AuthoredDefinitionResource): Promise<SceneViewSynchronizationOutcome> {
		this.synchronized.push(definition);
		return Promise.resolve({ status: 'unchanged' });
	}

	close(resource: string): Promise<void> {
		this.closed.push(resource);
		return Promise.resolve();
	}

	closeAll(): Promise<void> {
		this.closeAllCount++;
		return Promise.resolve();
	}

	select(definition: AuthoredDefinitionResource, occurrence: HierarchyOccurrenceDto | null): Promise<void> {
		this.selected.push({ definition: definition.assetId, occurrence });
		return Promise.resolve();
	}

	resolveSelection(_event: SceneViewSelectionEvent): ResolvedSceneViewSelection | undefined {
		return this.resolved;
	}
}

class TestLogger {
	appendLine(_message: string): void {
		// The registration should not report failures in these successful lifecycle tests.
	}
}

function snapshot(assetId: string, revision: number, path: readonly string[] = []) {
	const hierarchy = path.reduceRight<readonly HierarchyNodeDto[]>(
		(children, _identity, index) => [hierarchyNode(assetId, path.slice(0, index + 1), children)],
		[]
	);
	return {
		revision,
		context: {
			assetId,
			kind: 'scene-definition' as const,
			origin: 'authored' as const,
			editable: true,
			source: `file:///project/${assetId}.scene.json`,
			label: { kind: 'literal' as const, text: assetId, messageCode: null, arguments: [] }
		},
		roots: hierarchy
	};
}

function hierarchyNode(assetId: string, entityPath: readonly string[], children: readonly HierarchyNodeDto[]): HierarchyNodeDto {
	const identity = entityPath.at(-1)!;
	const occurrence = { definitionAssetId: assetId, entityPath };
	return {
		occurrence,
		kind: 'local-entity' as const,
		entityId: identity,
		definitionId: null,
		label: { kind: 'literal' as const, text: identity, messageCode: null, arguments: [] },
		enabled: true,
		modified: false,
		editable: true,
		target: { kind: 'local-entity' as const, source: `file:///project/${assetId}.scene.json`, identity, occurrence },
		children
	};
}

function selectionEvent(): SceneViewSelectionEvent {
	return {
		viewportId: 'viewport-1',
		connectionGeneration: 'connection-a',
		projectGeneration: 7,
		sceneAssetId: 'scene-a',
		revision: 0,
		occurrence: { rootDefinitionAssetId: 'scene-a', entityPath: ['environment'] }
	};
}
