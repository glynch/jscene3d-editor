/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IJScene3DViewportCameraState } from '../../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatJScene3DCameraInfo, isJScene3DCameraInfoVisible, JScene3DCameraInfoOverlay } from '../../electron-browser/jscene3dCameraInfoOverlay.js';

suite('JScene3DCameraInfoOverlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('formats camera values with stable precision and no negative zero', () => {
		assert.deepStrictEqual(formatJScene3DCameraInfo(cameraState({
			position: [-0.0001, 1.234, -5.678],
			orientationDegrees: [-0.01, 45.04, -90.06],
			pivot: [-0, 2, 3.999],
			projection: 'orthographic'
		})), {
			position: ['0.00', '1.23', '-5.68'],
			orientation: ['0.0°', '45.0°', '-90.1°'],
			pivot: ['0.00', '2.00', '4.00'],
			projection: 'Orthographic'
		});
	});

	test('is enabled by default and honors an explicit setting', () => {
		assert.strictEqual(isJScene3DCameraInfoVisible(undefined), true);
		assert.strictEqual(isJScene3DCameraInfoVisible(true), true);
		assert.strictEqual(isJScene3DCameraInfoVisible(false), false);
	});

	test('shows only an active Scene session with authoritative camera state', () => {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add({ dispose: () => parent.remove() });
		const overlay = store.add(new JScene3DCameraInfoOverlay(parent));
		const element = parent.querySelector<HTMLElement>('.jscene3d-camera-info')!;

		assert.strictEqual(element.classList.contains('is-visible'), false);
		assert.strictEqual(element.getAttribute('aria-hidden'), 'true');
		overlay.setActive(true);
		assert.strictEqual(element.classList.contains('is-visible'), false, 'does not invent zero values before renderer state arrives');

		overlay.setState(cameraState());
		assert.strictEqual(element.classList.contains('is-visible'), true);
		assert.strictEqual(element.getAttribute('role'), 'group');
		assert.strictEqual(element.getAttribute('aria-hidden'), 'false');
		assert.deepStrictEqual(
			Array.from(parent.querySelectorAll('.jscene3d-camera-info-value')).map(node => node.textContent),
			['1.25  -2.50  3.75', '10.0°  20.0°  30.0°', '0.00  1.00  0.00', 'Perspective']
		);

		overlay.setVisible(false);
		assert.strictEqual(element.classList.contains('is-visible'), false);
		overlay.setVisible(true);
		overlay.setActive(false);
		assert.strictEqual(element.classList.contains('is-visible'), false);
	});
});

function cameraState(overrides: Partial<IJScene3DViewportCameraState> = {}): IJScene3DViewportCameraState {
	return {
		paneId: 'pane-a',
		sessionId: 1,
		rendererGeneration: 1,
		position: [1.25, -2.5, 3.75],
		orientationDegrees: [10, 20, 30],
		pivot: [0, 1, 0],
		projection: 'perspective',
		...overrides
	};
}
