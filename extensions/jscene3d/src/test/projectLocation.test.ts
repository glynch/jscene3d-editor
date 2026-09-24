/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { localProjectPath } from '../project/projectLocation';

suite('JScene3D project location', () => {
	test('accepts a local file URI', () => {
		assert.strictEqual(localProjectPath({ scheme: 'file', fsPath: '/projects/sample/sample.j3d' }), '/projects/sample/sample.j3d');
	});

	test('rejects a virtual project URI', () => {
		assert.throws(
			() => localProjectPath({ scheme: 'vscode-vfs', fsPath: '/projects/sample/sample.j3d' }),
			/JScene3D projects must use the local file system/
		);
	});
});
