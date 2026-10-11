/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IJScene3DViewportGestureSettings, isJScene3DViewportWheelZoomEnabled, resolveJScene3DViewportDragAction } from '../../browser/jscene3dViewportNavigationBindings.js';

suite('JScene3DViewportNavigationBindings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const enabled: IJScene3DViewportGestureSettings = {
		altDragOrbitEnabled: true,
		shiftAltDragPanEnabled: true,
		middleButtonPanEnabled: true,
		scrollZoomEnabled: true,
		pinchZoomEnabled: true,
		altRightDragZoomEnabled: true
	};

	test('resolves default mouse and trackpad drag vocabulary', () => {
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 0, altKey: true, shiftKey: false }, enabled), 'orbit');
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 0, altKey: true, shiftKey: true }, enabled), 'pan');
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 1, altKey: false, shiftKey: false }, enabled), 'pan');
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 2, altKey: true, shiftKey: false }, enabled), 'zoom');
	});

	test('releases individually disabled gestures', () => {
		const disabled: IJScene3DViewportGestureSettings = {
			altDragOrbitEnabled: false,
			shiftAltDragPanEnabled: false,
			middleButtonPanEnabled: false,
			scrollZoomEnabled: false,
			pinchZoomEnabled: false,
			altRightDragZoomEnabled: false
		};
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 0, altKey: true, shiftKey: false }, disabled), undefined);
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 0, altKey: true, shiftKey: true }, disabled), undefined);
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 1, altKey: false, shiftKey: false }, disabled), undefined);
		assert.strictEqual(resolveJScene3DViewportDragAction({ button: 2, altKey: true, shiftKey: false }, disabled), undefined);
		assert.strictEqual(isJScene3DViewportWheelZoomEnabled(false, disabled), false);
		assert.strictEqual(isJScene3DViewportWheelZoomEnabled(true, disabled), false);
	});

	test('distinguishes ordinary scroll and pinch wheel events', () => {
		assert.strictEqual(isJScene3DViewportWheelZoomEnabled(false, { ...enabled, scrollZoomEnabled: false }), false);
		assert.strictEqual(isJScene3DViewportWheelZoomEnabled(true, { ...enabled, pinchZoomEnabled: false }), false);
		assert.strictEqual(isJScene3DViewportWheelZoomEnabled(false, enabled), true);
		assert.strictEqual(isJScene3DViewportWheelZoomEnabled(true, enabled), true);
	});
});
