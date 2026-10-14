/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { JScene3DViewportDragAction } from '../../browser/jscene3dViewportNavigationBindings.js';
import { JScene3DViewportToolbars } from '../../electron-browser/jscene3dViewportToolbars.js';

suite('JScene3DViewportToolbars', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createToolbars() {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add({ dispose: () => parent.remove() });
		const actions: JScene3DViewportDragAction[] = [];
		let projectionToggles = 0;
		let displayOptions = 0;
		const toolbars = store.add(new JScene3DViewportToolbars(parent, 120, {
			beginDrag: (_event, action) => actions.push(action),
			continueDrag: () => undefined,
			endDrag: () => undefined,
			toggleProjection: () => projectionToggles++,
			selectTool: () => undefined,
			toggleSnapping: () => undefined,
			toggleSpace: () => undefined,
			showDisplayOptions: () => displayOptions++
		}));
		return { parent, toolbars, actions, projectionToggles: () => projectionToggles, displayOptions: () => displayOptions };
	}

	test('presents three consistent floating toolbars and persistent entity-tool state', () => {
		const { parent, toolbars } = createToolbars();
		toolbars.setActive(true);

		const overlays = parent.querySelectorAll('.jscene3d-scene-toolbar.is-visible');
		assert.strictEqual(overlays.length, 3);
		assert.strictEqual((parent.querySelector('.jscene3d-scene-toolbar-right') as HTMLElement).style.top, '120px');

		const select = parent.querySelector<HTMLButtonElement>('[aria-label="Select (Q)"]')!;
		assert.strictEqual(select.disabled, false);
		assert.strictEqual(select.getAttribute('aria-pressed'), 'true');
		assert.ok(select.classList.contains('is-selected'));

		for (const label of ['Move (W)', 'Rotate (E)', 'Scale (R)']) {
			const button = parent.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
			assert.strictEqual(button.disabled, false);
			assert.strictEqual(button.getAttribute('aria-pressed'), 'false');
			assert.ok(!button.classList.contains('is-selected'));
		}
		assert.strictEqual(parent.querySelector<HTMLButtonElement>('[aria-label="Rect / Bounds (T)"]')!.disabled, true);
	});

	test('keeps exactly one persistent entity tool selected through every transition', () => {
		const { parent, toolbars } = createToolbars();
		const expectedLabels = {
			select: 'Select (Q)',
			move: 'Move (W)',
			rotate: 'Rotate (E)',
			scale: 'Scale (R)'
		} as const;
		for (const tool of ['select', 'move', 'rotate', 'scale', 'select'] as const) {
			toolbars.setTransformState(tool, 'global', false);
			const selected = Array.from(parent.querySelectorAll<HTMLButtonElement>('.jscene3d-scene-toolbar-left [aria-pressed="true"]'));
			assert.deepStrictEqual(selected.map(button => ({
				label: button.getAttribute('aria-label'),
				selected: button.classList.contains('is-selected')
			})), [{ label: expectedLabels[tool], selected: true }]);
		}
	});

	test('retains readable semantic states for disabled display controls', () => {
		const { parent } = createToolbars();
		const shaded = parent.querySelector<HTMLButtonElement>('[aria-label="Shaded"]')!;
		const grid = parent.querySelector<HTMLButtonElement>('[aria-label="Grid"]')!;
		const snap = parent.querySelector<HTMLButtonElement>('[aria-label="Snap"]')!;

		assert.deepStrictEqual({
			shaded: { disabled: shaded.disabled, pressed: shaded.getAttribute('aria-pressed'), selected: shaded.classList.contains('is-selected') },
			grid: { disabled: grid.disabled, pressed: grid.getAttribute('aria-pressed'), selected: grid.classList.contains('is-selected') },
			snap: { disabled: snap.disabled, pressed: snap.getAttribute('aria-pressed'), selected: snap.classList.contains('is-selected') }
		}, {
			shaded: { disabled: true, pressed: 'true', selected: true },
			grid: { disabled: true, pressed: 'true', selected: true },
			snap: { disabled: false, pressed: 'false', selected: false }
		});
	});

	test('uses recognizable orbit, hand, zoom and stateful projection icons', () => {
		const { parent, toolbars, projectionToggles } = createToolbars();
		assert.ok(parent.querySelector('[aria-label="Orbit"].codicon-sync'));
		assert.ok(parent.querySelector('[aria-label="Pan"] .jscene3d-scene-toolbar-hand'));
		assert.ok(parent.querySelector('[aria-label="Zoom"].codicon-zoom-in'));

		const projection = parent.querySelector<HTMLButtonElement>('[aria-label="Toggle Perspective / Orthographic"]')!;
		assert.strictEqual(projection.dataset.projection, 'perspective');
		assert.strictEqual(projection.getAttribute('aria-pressed'), 'false');
		projection.click();
		assert.strictEqual(projection.dataset.projection, 'perspective', 'waits for renderer-authoritative state');
		assert.strictEqual(projection.getAttribute('aria-pressed'), 'false');
		toolbars.setProjection('orthographic');
		assert.strictEqual(projection.dataset.projection, 'orthographic');
		assert.strictEqual(projection.getAttribute('aria-pressed'), 'true');
		assert.ok(projection.classList.contains('is-selected'));
		assert.strictEqual(projectionToggles(), 1);
	});

	test('opens the Scene display-options seam from an enabled toolbar control', () => {
		const { parent, displayOptions } = createToolbars();
		const button = parent.querySelector<HTMLButtonElement>('[aria-label="Display Options"]')!;

		assert.strictEqual(button.disabled, false);
		assert.strictEqual(button.getAttribute('aria-haspopup'), 'menu');
		button.click();
		assert.strictEqual(displayOptions(), 1);
	});

	test('highlights only the temporary navigation action', () => {
		const { parent, toolbars } = createToolbars();
		const orbit = parent.querySelector<HTMLButtonElement>('[aria-label="Orbit"]')!;
		const pan = parent.querySelector<HTMLButtonElement>('[aria-label="Pan"]')!;
		const zoom = parent.querySelector<HTMLButtonElement>('[aria-label="Zoom"]')!;

		toolbars.setNavigationInteraction('pan');
		assert.ok(!orbit.classList.contains('is-dragging'));
		assert.ok(pan.classList.contains('is-dragging'));
		assert.ok(!zoom.classList.contains('is-dragging'));
		assert.strictEqual(pan.getAttribute('aria-pressed'), 'true');

		toolbars.setNavigationInteraction(undefined);
		assert.ok(!pan.classList.contains('is-dragging'));
		assert.strictEqual(pan.getAttribute('aria-pressed'), 'false');
	});
});
