/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getDefaultLayoutViews } from '../../browser/defaultLayout.js';

suite('Workbench default layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const productDefault = { views: [{ id: 'jscene3d.hierarchy' }] };

	test('makes a non-forced product default eligible only for a new workspace', () => {
		assert.deepStrictEqual({
			newWorkspace: getDefaultLayoutViews(productDefault, true),
			restoredWorkspace: getDefaultLayoutViews(productDefault, false)
		}, {
			newWorkspace: ['jscene3d.hierarchy'],
			restoredWorkspace: undefined
		});
	});

	test('leaves saved Explorer and JScene3D selections eligible in an existing workspace', () => {
		const productDefaultViews = getDefaultLayoutViews(productDefault, false);
		const savedExplorer = 'workbench.view.explorer';
		const savedJScene3D = 'workbench.view.extension.jscene3d';

		assert.deepStrictEqual({
			productDefaultViews,
			explorerToRestore: productDefaultViews === undefined ? savedExplorer : savedJScene3D,
			jscene3dToRestore: productDefaultViews === undefined ? savedJScene3D : savedExplorer
		}, {
			productDefaultViews: undefined,
			explorerToRestore: savedExplorer,
			jscene3dToRestore: savedJScene3D
		});
	});

	test('preserves forced web workbench defaults', () => {
		assert.deepStrictEqual(getDefaultLayoutViews({ ...productDefault, force: true }, false), ['jscene3d.hierarchy']);
	});
});
