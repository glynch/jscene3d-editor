/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getDefaultLayoutViews } from '../../browser/defaultLayout.js';

suite('Workbench default layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const productDefault = { views: [{ id: 'example.primaryView' }] };

	test('makes a non-forced product default eligible only for a new workspace', () => {
		assert.deepStrictEqual({
			newWorkspace: getDefaultLayoutViews(productDefault, true),
			restoredWorkspace: getDefaultLayoutViews(productDefault, false)
		}, {
			newWorkspace: ['example.primaryView'],
			restoredWorkspace: undefined
		});
	});

	test('leaves saved view-container selections eligible in an existing workspace', () => {
		const productDefaultViews = getDefaultLayoutViews(productDefault, false);
		const savedPrimary = 'workbench.view.explorer';
		const savedSecondary = 'workbench.view.extension.example';

		assert.deepStrictEqual({
			productDefaultViews,
			primaryToRestore: productDefaultViews === undefined ? savedPrimary : savedSecondary,
			secondaryToRestore: productDefaultViews === undefined ? savedSecondary : savedPrimary
		}, {
			productDefaultViews: undefined,
			primaryToRestore: savedPrimary,
			secondaryToRestore: savedSecondary
		});
	});

	test('preserves forced web workbench defaults', () => {
		assert.deepStrictEqual(getDefaultLayoutViews({ ...productDefault, force: true }, false), ['example.primaryView']);
	});
});
