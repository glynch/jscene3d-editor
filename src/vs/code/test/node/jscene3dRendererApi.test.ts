/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IJScene3DRendererApi, IJScene3DRendererLaunchRequest, initializeJScene3DRendererApi } from '../../node/jscene3dRendererApi.js';

suite('JScene3D renderer API initialization', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('requires the renderer API before the first viewport launch can be registered', () => {
		assert.throws(
			() => initializeJScene3DRendererApi({}),
			/The JScene3D renderer API is unavailable in this Electron process/
		);

		const renderer = new TestRendererApi();
		const initialized = initializeJScene3DRendererApi({ jscene3dRenderer: renderer });
		const first = initialized.launchRenderer(launchRequest());
		const subsequent = initialized.launchRenderer(launchRequest());

		assert.deepStrictEqual(
			{ firstSessionId: first.sessionId, subsequentSessionId: subsequent.sessionId, launches: renderer.launches },
			{ firstSessionId: 1, subsequentSessionId: 2, launches: 2 }
		);
	});
});

class TestRendererApi implements IJScene3DRendererApi {
	launches = 0;

	launchRenderer(): ReturnType<IJScene3DRendererApi['launchRenderer']> {
		this.launches++;
		return { sessionId: this.launches, pid: this.launches + 1, surfaceGeneration: 1 };
	}

	getSurface(): null { return null; }
	sendRendererMessage(): boolean { return true; }
	replaceSurface(): boolean { return true; }
	pauseRenderer(): boolean { return true; }
	resumeRenderer(): boolean { return true; }
	stopRenderer(): Promise<void> { return Promise.resolve(); }
	stopAllRenderers(): Promise<void> { return Promise.resolve(); }
}

function launchRequest(): IJScene3DRendererLaunchRequest {
	return {
		javaExecutable: '/java',
		workingDirectory: '/runtime',
		nativeLibraryDirectory: '/runtime/native',
		classPath: ['/runtime/lib/runtime.jar'],
		mainClass: 'example.Main',
		rendererArguments: [],
		width: 640,
		height: 360
	};
}
