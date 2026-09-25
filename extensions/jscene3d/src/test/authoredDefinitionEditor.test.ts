/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('JScene3D authored definition editor', () => {
	test('keeps both static documents script-free with a restrictive CSP', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '..', '..', 'src', 'definition', 'authoredDefinitionEditor.ts'),
			'utf8'
		);

		assert.match(source, /Content-Security-Policy/);
		assert.match(source, /default-src \\'none\\'/);
		assert.strictEqual(source.match(/\$\{restrictiveContentSecurityPolicy\}/g)?.length, 2);
		assert.match(source, /enableScripts: false/);
	});
});
