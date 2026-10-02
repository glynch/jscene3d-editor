/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('JScene3D workbench product integration', () => {
	test('uses the always-available Project view as the non-forced initial product layout', () => {
		const product = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'product.json'), 'utf8')) as {
			readonly defaultLayout?: { readonly force?: boolean; readonly views?: readonly { readonly id: string }[] };
		};

		assert.deepStrictEqual(product.defaultLayout, {
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
		});
	});
});
