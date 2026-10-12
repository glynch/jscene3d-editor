/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IJScene3DTransformPointer } from '../../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { JScene3DViewportNavigation } from '../../electron-browser/jscene3dViewportNavigation.js';

suite('JScene3DViewportNavigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createNavigation() {
		const parent = mainWindow.document.createElement('div');
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = 800;
		canvas.height = 600;
		canvas.setPointerCapture = () => undefined;
		canvas.releasePointerCapture = () => undefined;
		canvas.hasPointerCapture = () => false;
		parent.append(canvas);
		mainWindow.document.body.append(parent);
		store.add({ dispose: () => parent.remove() });
		canvas.getBoundingClientRect = () => ({
			bottom: 600,
			height: 600,
			left: 0,
			right: 800,
			top: 0,
			width: 800,
			x: 0,
			y: 0,
			toJSON: () => undefined
		});
		const transforms: IJScene3DTransformPointer[] = [];
		const selections: Array<{ horizontal: number; vertical: number }> = [];
		const navigation = store.add(new JScene3DViewportNavigation(
			parent,
			canvas,
			new TestConfigurationService(),
			() => undefined,
			(horizontal, vertical) => {
				selections.push({ horizontal, vertical });
			},
			() => undefined,
			pointer => {
				transforms.push(pointer);
			}
		));
		navigation.setActive(true);
		navigation.selectTransformTool('move');
		return { canvas, navigation, selections, transforms };
	}

	function pointer(type: string, init: PointerEventInit): PointerEvent {
		return new mainWindow.PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', ...init });
	}

	test('retains a transform drag when held pointer events leave canvas ownership', () => {
		const { canvas, transforms } = createNavigation();
		canvas.dispatchEvent(pointer('pointerdown', { pointerId: 17, button: 0, buttons: 1, clientX: 300, clientY: 240 }));
		mainWindow.dispatchEvent(pointer('pointermove', { pointerId: 17, button: -1, buttons: 1, clientX: 320, clientY: 240 }));
		mainWindow.dispatchEvent(pointer('pointermove', { pointerId: 17, button: -1, buttons: 1, clientX: 350, clientY: 240 }));
		mainWindow.dispatchEvent(pointer('pointerup', { pointerId: 17, button: 0, buttons: 0, clientX: 350, clientY: 240 }));

		assert.deepStrictEqual(transforms.map(transform => transform.phase), ['begin', 'update', 'update', 'commit']);
		assert.deepStrictEqual(transforms.at(-1), {
			phase: 'commit',
			horizontal: 350,
			vertical: 240,
			viewportWidth: 800,
			viewportHeight: 600
		});
	});

	test('cancels an interrupted transform when pointer movement no longer has a held primary button', () => {
		const { canvas, transforms } = createNavigation();
		canvas.dispatchEvent(pointer('pointerdown', { pointerId: 23, button: 0, buttons: 1, clientX: 300, clientY: 240 }));
		mainWindow.dispatchEvent(pointer('pointermove', { pointerId: 23, button: -1, buttons: 0, clientX: 320, clientY: 240 }));

		assert.deepStrictEqual(transforms.map(transform => transform.phase), ['begin', 'cancel']);
		assert.ok(!canvas.classList.contains('is-transform-dragging'));
	});

	test('cancels with Escape and when the Scene View loses active ownership', () => {
		const { canvas, navigation, transforms } = createNavigation();
		canvas.dispatchEvent(pointer('pointerdown', { pointerId: 31, button: 0, buttons: 1, clientX: 300, clientY: 240 }));
		mainWindow.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
		canvas.dispatchEvent(pointer('pointerdown', { pointerId: 32, button: 0, buttons: 1, clientX: 300, clientY: 240 }));
		navigation.setActive(false);

		assert.deepStrictEqual(transforms.map(transform => transform.phase), ['begin', 'cancel', 'begin', 'cancel']);
		assert.ok(!canvas.classList.contains('is-transform-dragging'));
		assert.strictEqual(canvas.dataset.transformTool, undefined);
	});

	test('keeps Select as a normal entity-selection interaction', () => {
		const { canvas, navigation, selections, transforms } = createNavigation();
		navigation.selectTransformTool('select');
		canvas.dispatchEvent(pointer('pointerup', { pointerId: 41, button: 0, buttons: 0, clientX: 400, clientY: 300 }));

		assert.deepStrictEqual(selections, [{ horizontal: 0, vertical: 0 }]);
		assert.deepStrictEqual(transforms, []);
	});
});
