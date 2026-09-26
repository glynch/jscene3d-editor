/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import product from '../../../../../platform/product/common/product.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getNativeWorkbenchConstructionOptions } from '../../electron-browser/environmentService.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';

suite('NativeWorkbenchEnvironmentService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps the JScene3D product default view to non-forced workbench construction options', () => {
		assert.deepStrictEqual(getNativeWorkbenchConstructionOptions(product), {
			defaultLayout: {
				views: [{ id: 'jscene3d.hierarchy' }]
			}
		});
	});

	test('preserves existing behavior when the product has no default layout', () => {
		assert.strictEqual(getNativeWorkbenchConstructionOptions({ ...TestProductService, defaultLayout: undefined }), undefined);
	});
});
