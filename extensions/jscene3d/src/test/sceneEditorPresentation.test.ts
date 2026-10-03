/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { sceneEditorHtml } from '../sceneView/sceneEditorPresentation';

const label = { kind: 'literal' as const, text: 'Main', messageCode: null, arguments: [] };
const text = { scene: 'Scene', loading: 'Loading Scene…' };

suite('JScene3D Scene editor presentation', () => {
	test('shows projection pending without exposing a black native canvas', () => {
		const html = sceneEditorHtml(label, { kind: 'projection-pending' }, text);

		assert.match(html, /Loading Scene…/);
		assert.match(html, /role="status"/);
		assert.doesNotMatch(html, /<canvas/);
	});

	test('shows and escapes a useful projection failure', () => {
		const html = sceneEditorHtml(label, { kind: 'failed', reason: 'Invalid <mesh> & material' }, text);

		assert.match(html, /Invalid &lt;mesh&gt; &amp; material/);
		assert.match(html, /role="alert"/);
	});
});
