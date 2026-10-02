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

	test('maps the JScene3D product welcome editor into native workbench construction options', () => {
		assert.deepStrictEqual(getNativeWorkbenchConstructionOptions(product), {
			defaultLayout: {
				views: [{ id: 'jscene3d.project' }],
				editors: [{
					uri: {
						scheme: 'walkThrough',
						authority: 'vscode_getting_started_page'
					},
					options: {
						override: 'workbench.editors.gettingStartedInput',
						pinned: false
					}
				}]
			}
		});
	});

	test('maps a generic product default view to non-forced workbench construction options', () => {
		assert.deepStrictEqual(getNativeWorkbenchConstructionOptions({
			defaultLayout: { views: [{ id: 'example.primaryView' }] }
		}), {
			defaultLayout: {
				views: [{ id: 'example.primaryView' }]
			}
		});
	});

	test('preserves existing behavior when the product has no default layout', () => {
		assert.strictEqual(getNativeWorkbenchConstructionOptions({ ...TestProductService, defaultLayout: undefined }), undefined);
	});
});
