/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { PartVisibilityIntent, Parts } from '../../browser/layoutService.js';
import { WorkbenchPartVisibilityIntentState } from '../../browser/partVisibilityIntent.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('WorkbenchPartVisibilityIntentState', () => {

	const storageKey = 'workbench.partVisibilityIntent';
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults every supported view-hosting part independently of actual visibility', () => {
		const state = new WorkbenchPartVisibilityIntentState(store.add(new TestStorageService()), false);

		assert.strictEqual(state.get(Parts.SIDEBAR_PART), PartVisibilityIntent.Default);
		assert.strictEqual(state.get(Parts.PANEL_PART), PartVisibilityIntent.Default);
		assert.strictEqual(state.get(Parts.AUXILIARYBAR_PART), PartVisibilityIntent.Default);
	});

	test('records explicit shown and hidden intent per part', () => {
		const state = new WorkbenchPartVisibilityIntentState(store.add(new TestStorageService()), false);

		state.set(Parts.SIDEBAR_PART, PartVisibilityIntent.ExplicitlyShown);
		state.set(Parts.PANEL_PART, PartVisibilityIntent.ExplicitlyHidden);

		assert.strictEqual(state.get(Parts.SIDEBAR_PART), PartVisibilityIntent.ExplicitlyShown);
		assert.strictEqual(state.get(Parts.PANEL_PART), PartVisibilityIntent.ExplicitlyHidden);
		assert.strictEqual(state.get(Parts.AUXILIARYBAR_PART), PartVisibilityIntent.Default);
	});

	test('persists and restores explicit intent through workspace machine storage', () => {
		const storageService = store.add(new TestStorageService());
		const state = new WorkbenchPartVisibilityIntentState(storageService, false);
		state.set(Parts.SIDEBAR_PART, PartVisibilityIntent.ExplicitlyShown);
		state.set(Parts.AUXILIARYBAR_PART, PartVisibilityIntent.ExplicitlyHidden);
		state.save();

		const restored = new WorkbenchPartVisibilityIntentState(storageService, false);

		assert.strictEqual(restored.get(Parts.SIDEBAR_PART), PartVisibilityIntent.ExplicitlyShown);
		assert.strictEqual(restored.get(Parts.PANEL_PART), PartVisibilityIntent.Default);
		assert.strictEqual(restored.get(Parts.AUXILIARYBAR_PART), PartVisibilityIntent.ExplicitlyHidden);
	});

	test('treats missing, malformed, and unknown stored values as default', () => {
		const storageService = store.add(new TestStorageService());
		storageService.store(storageKey, JSON.stringify({
			[Parts.SIDEBAR_PART]: 'visible',
			[Parts.PANEL_PART]: PartVisibilityIntent.ExplicitlyShown,
			[Parts.AUXILIARYBAR_PART]: 1,
			'workbench.parts.unknown': PartVisibilityIntent.ExplicitlyHidden,
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const state = new WorkbenchPartVisibilityIntentState(storageService, false);

		assert.strictEqual(state.get(Parts.SIDEBAR_PART), PartVisibilityIntent.Default);
		assert.strictEqual(state.get(Parts.PANEL_PART), PartVisibilityIntent.ExplicitlyShown);
		assert.strictEqual(state.get(Parts.AUXILIARYBAR_PART), PartVisibilityIntent.Default);

		storageService.store(storageKey, '{', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const malformed = new WorkbenchPartVisibilityIntentState(storageService, false);
		assert.strictEqual(malformed.get(Parts.PANEL_PART), PartVisibilityIntent.Default);
	});

	test('layout reset ignores stored intent and removes it on the normal save lifecycle', () => {
		const storageService = store.add(new TestStorageService());
		const state = new WorkbenchPartVisibilityIntentState(storageService, false);
		state.set(Parts.AUXILIARYBAR_PART, PartVisibilityIntent.ExplicitlyHidden);
		state.save();

		const resetState = new WorkbenchPartVisibilityIntentState(storageService, true);
		assert.strictEqual(resetState.get(Parts.AUXILIARYBAR_PART), PartVisibilityIntent.Default);

		resetState.save();
		assert.strictEqual(storageService.get(storageKey, StorageScope.WORKSPACE), undefined);
	});

	test('returning a part to default removes redundant persisted state', () => {
		const storageService = store.add(new TestStorageService());
		const state = new WorkbenchPartVisibilityIntentState(storageService, false);
		state.set(Parts.PANEL_PART, PartVisibilityIntent.ExplicitlyHidden);
		state.set(Parts.PANEL_PART, PartVisibilityIntent.Default);
		state.save();

		assert.strictEqual(storageService.get(storageKey, StorageScope.WORKSPACE), undefined);
	});
});
