/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { JScene3DViewportEditorInput } from '../../browser/jscene3dViewportEditorInput.js';

const launch = {
	viewportId: 'viewport-a',
	connectionGeneration: 'connection-a',
	projectGeneration: 7,
	projectId: 'example.project',
	projectName: 'Example Project',
	projectRoot: '/projects/example',
	publishedContentRoot: '/projects/example/.jscene3d/published',
	engineVersion: '0.1.0-SNAPSHOT',
	sceneAssetId: 'e890c4c3-fb32-49d8-88b8-4e04e7a29656',
	sceneName: 'Opening Scene',
	runtimeArtifacts: ['/runtime/example.jar']
};

suite('JScene3DViewportEditorInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes service, project, Scene, and viewport identity without becoming a singleton', () => {
		const first = new JScene3DViewportEditorInput(launch);
		const sameViewport = new JScene3DViewportEditorInput({ ...launch });
		const otherViewport = new JScene3DViewportEditorInput({ ...launch, viewportId: 'viewport-b' });
		const staleGeneration = new JScene3DViewportEditorInput({ ...launch, projectGeneration: 8 });
		try {
			assert.match(first.resource.toString(), /^jscene3d-viewport:\/\/connection-a\/7\//);
			assert.strictEqual(first.matches(sameViewport), true);
			assert.strictEqual(first.matches(otherViewport), false);
			assert.strictEqual(first.matches(staleGeneration), false);
			assert.strictEqual(first.getName(), 'Example Project — Opening Scene');
			assert.strictEqual(first.hasCapability(EditorInputCapabilities.Singleton), false);
			assert.strictEqual(first.hasCapability(EditorInputCapabilities.Readonly), true);
		} finally {
			first.dispose();
			sameViewport.dispose();
			otherViewport.dispose();
			staleGeneration.dispose();
		}
	});
});
