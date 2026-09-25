/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adaptJScene3DSourceControlWelcome } from '../../common/viewsWelcomeContribution.js';
import { ViewWelcome } from '../../common/viewsWelcomeExtensionPoint.js';

suite('Views welcome contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const gitSourceControlWelcome: ViewWelcome = {
		view: 'scm',
		contents: 'In order to use Git features, you can open a folder containing a Git repository or clone from a URL.\n[Open Folder](command:vscode.openFolder)\n[Clone Repository](command:git.cloneRecursive)',
		when: 'workbenchState == empty',
		group: '2_open@1',
		enablement: 'git.state == initialized'
	};

	test('uses JScene3D project opening and retains repository cloning', () => {
		const result = adaptJScene3DSourceControlWelcome(gitSourceControlWelcome, 'vscode.git', 'jscene3d-editor');

		assert.deepStrictEqual(result, {
			...gitSourceControlWelcome,
			contents: 'In order to use Git features, open a JScene3D project containing a Git repository or clone from a URL.\n[Open Project...](command:jscene3d.openProject)\n[Clone Repository](command:git.cloneRecursive)'
		});
	});

	test('preserves the generic Source Control welcome content for other products', () => {
		const result = adaptJScene3DSourceControlWelcome(gitSourceControlWelcome, 'vscode.git', 'code-oss');

		assert.strictEqual(result, gitSourceControlWelcome);
		assert.deepStrictEqual(result.contents, gitSourceControlWelcome.contents);
	});
});
