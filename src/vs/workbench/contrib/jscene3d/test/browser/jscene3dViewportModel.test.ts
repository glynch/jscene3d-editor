/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { JScene3DViewportModel, JScene3DViewportStopGate, physicalViewportSize, synchronizeCanvasBackingStore } from '../../browser/jscene3dViewportModel.js';

suite('JScene3DViewportModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('calculates physical pixels and rejects empty viewport sizes', () => {
		assert.deepStrictEqual(physicalViewportSize(640.25, 360.25, 1), { width: 640, height: 360 });
		assert.deepStrictEqual(physicalViewportSize(640.25, 360.25, 2), { width: 1281, height: 721 });
		assert.deepStrictEqual(physicalViewportSize(20000, 20000, 2), { width: 16384, height: 16384 });
		assert.strictEqual(physicalViewportSize(0, 100, 2), undefined);
		assert.strictEqual(physicalViewportSize(100, 100, 0), undefined);
	});

	test('synchronizes the canvas backing store independently of renderer resize deduplication', () => {
		const canvas = { width: 300, height: 150 };

		assert.strictEqual(synchronizeCanvasBackingStore(canvas, { width: 1281, height: 721 }), true);
		assert.deepStrictEqual(canvas, { width: 1281, height: 721 });
		assert.strictEqual(synchronizeCanvasBackingStore(canvas, { width: 1281, height: 721 }), false);
	});

	test('deduplicates resize requests for one bound session', () => {
		const model = new JScene3DViewportModel();
		model.bindSession({ sessionId: 7, rendererGeneration: 3 });
		const dpr1Size = physicalViewportSize(640, 360, 1)!;
		const dpr2Size = physicalViewportSize(640, 360, 2)!;
		assert.strictEqual(model.requestResize(dpr1Size), true);
		assert.strictEqual(model.requestResize(dpr1Size), false);
		assert.strictEqual(model.requestResize(dpr2Size), true);
	});

	test('emits visibility transitions only after a session exists', () => {
		const model = new JScene3DViewportModel();
		assert.strictEqual(model.setVisible(true), undefined);
		assert.strictEqual(model.bindSession({ sessionId: 7, rendererGeneration: 3 }), 'resume');
		assert.strictEqual(model.setVisible(true), undefined);
		assert.strictEqual(model.setVisible(false), 'pause');
		assert.strictEqual(model.setVisible(true), 'resume');
	});

	test('failure and disposal stop the owned session exactly once', () => {
		const failed = new JScene3DViewportModel();
		failed.bindSession({ sessionId: 7, rendererGeneration: 3 });
		assert.strictEqual(failed.fail(), 'stop');
		assert.strictEqual(failed.fail(), undefined);

		const disposed = new JScene3DViewportModel();
		disposed.bindSession({ sessionId: 8, rendererGeneration: 4 });
		assert.strictEqual(disposed.dispose(), 'stop');
		assert.strictEqual(disposed.dispose(), undefined);
	});

	test('disposal is terminal before asynchronous renderer stop completes', () => {
		const model = new JScene3DViewportModel();
		model.bindSession({ sessionId: 8, rendererGeneration: 4 });

		assert.strictEqual(model.acceptsRendererWork, true);
		assert.strictEqual(model.dispose(), 'stop');
		assert.strictEqual(model.acceptsRendererWork, false);
		assert.strictEqual(model.requestResize({ width: 640, height: 360 }), false);
		assert.strictEqual(model.setVisible(true), undefined);
		assert.strictEqual(model.fail(), undefined);
	});

	test('completed stop does not suppress a later viewport session stop', async () => {
		const gate = new JScene3DViewportStopGate();
		let stops = 0;

		await gate.run(async () => undefined);
		await gate.run(async () => { stops++; });

		assert.strictEqual(stops, 1);
		assert.strictEqual(gate.current, undefined);
	});
});
