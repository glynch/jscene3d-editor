/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { SceneViewLifecycleOperations, SceneViewRegistration } from '../sceneView/sceneViewRegistration';

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
});

class TestLifecycle implements SceneViewLifecycleOperations {
	readonly synchronized: AuthoredDefinitionResource[] = [];
	readonly closed: string[] = [];
	closeAllCount = 0;

	synchronize(definition: AuthoredDefinitionResource): Promise<void> {
		this.synchronized.push(definition);
		return Promise.resolve();
	}

	close(resource: string): Promise<void> {
		this.closed.push(resource);
		return Promise.resolve();
	}

	closeAll(): Promise<void> {
		this.closeAllCount++;
		return Promise.resolve();
	}
}

class TestLogger {
	appendLine(_message: string): void {
		// The registration should not report failures in these successful lifecycle tests.
	}
}

function snapshot(assetId: string, revision: number) {
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
		roots: []
	};
}
