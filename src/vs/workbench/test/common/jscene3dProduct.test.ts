/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { shouldRegisterChatWorkbenchSurfaces } from '../../common/jscene3dProduct.js';

suite('JScene3D workbench product policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('omits stock Chat surfaces only from the JScene3D product', () => {
		assert.deepStrictEqual({
			codeOss: shouldRegisterChatWorkbenchSurfaces('code-oss'),
			jscene3d: shouldRegisterChatWorkbenchSurfaces('jscene3d-editor')
		}, {
			codeOss: true,
			jscene3d: false
		});
	});
});
