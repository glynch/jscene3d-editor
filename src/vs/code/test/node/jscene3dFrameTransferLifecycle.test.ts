/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { JScene3DFrameTransferLifecycle } from '../../node/jscene3dFrameTransferLifecycle.js';

suite('JScene3D frame-transfer lifecycle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('treats a late successful transfer as interrupted after pause', () => {
		const lifecycle = new JScene3DFrameTransferLifecycle();
		const transfer = lifecycle.begin(1, 1);

		lifecycle.invalidate();

		assert.strictEqual(lifecycle.settle(transfer, 1, true), 'interrupted');
		assert.strictEqual(lifecycle.settle(lifecycle.begin(1, 2), 1, true), 'present');
	});

	test('treats a timeout during pause as interrupted and an active timeout as fatal', () => {
		const paused = new JScene3DFrameTransferLifecycle();
		const pausedTransfer = paused.begin(1, 1);
		paused.invalidate();
		assert.strictEqual(paused.settle(pausedTransfer, 1, false), 'interrupted');

		const active = new JScene3DFrameTransferLifecycle();
		assert.strictEqual(active.settle(active.begin(1, 1), 1, false), 'fail');
	});

	test('rejects an old surface generation after resize', () => {
		const lifecycle = new JScene3DFrameTransferLifecycle();
		const transfer = lifecycle.begin(4, 8);

		lifecycle.invalidate();

		assert.strictEqual(lifecycle.settle(transfer, 5, true), 'interrupted');
	});

	test('ignores completion after disposal or session replacement', () => {
		const disposed = new JScene3DFrameTransferLifecycle();
		const disposedTransfer = disposed.begin(1, 1);
		disposed.invalidate();
		assert.strictEqual(disposed.settle(disposedTransfer, 1, false), 'interrupted');

		const replaced = new JScene3DFrameTransferLifecycle();
		assert.strictEqual(replaced.settle(disposedTransfer, 1, true), 'interrupted');
	});

	test('survives repeated pause and resume invalidations without accepting stale transfers', () => {
		const lifecycle = new JScene3DFrameTransferLifecycle();
		for (let cycle = 0; cycle < 10; cycle++) {
			const stale = lifecycle.begin(1, cycle + 1);
			lifecycle.invalidate();
			assert.strictEqual(lifecycle.settle(stale, 1, cycle % 2 === 0), 'interrupted');
		}

		assert.strictEqual(lifecycle.settle(lifecycle.begin(1, 11), 1, true), 'present');
	});

	test('does not permit overlapping active Code OSS transfers', () => {
		const lifecycle = new JScene3DFrameTransferLifecycle();
		lifecycle.begin(1, 1);

		assert.throws(() => lifecycle.begin(1, 2), /already pending/);
	});
});
