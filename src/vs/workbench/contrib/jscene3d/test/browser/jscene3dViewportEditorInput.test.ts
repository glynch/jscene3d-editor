/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { JScene3DViewportEditorInput } from '../../browser/jscene3dViewportEditorInput.js';

suite('JScene3DViewportEditorInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('has stable singleton renderer-preview identity', () => {
		const first = new JScene3DViewportEditorInput();
		const second = new JScene3DViewportEditorInput();
		try {
			assert.strictEqual(first.resource.toString(), 'jscene3d-renderer-preview:/native-viewport');
			assert.strictEqual(first.matches(second), true);
			assert.strictEqual(first.hasCapability(EditorInputCapabilities.Singleton), true);
			assert.strictEqual(first.hasCapability(EditorInputCapabilities.Readonly), true);
		} finally {
			first.dispose();
			second.dispose();
		}
	});
});
