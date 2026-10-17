/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NumericDraftController } from '../inspector/numericDraftController';

suite('JScene3D Inspector numeric draft controller', () => {
	test('accepts complete and intermediate drafts but rejects impossible transitions', () => {
		const draft = new NumericDraftController('number', ['1']);

		draft.update(0, '1e-');
		const intermediate = draft.snapshot;
		draft.update(0, '12.3.4');
		const rejected = draft.snapshot;
		draft.update(0, '2.5');

		assert.deepStrictEqual({
			initialCommitted: intermediate.committedValues,
			intermediate: [intermediate.values, intermediate.statuses, intermediate.validationVisible, intermediate.pending],
			rejected: [rejected.values, rejected.statuses, rejected.validationVisible, rejected.pending],
			valid: [draft.snapshot.values, draft.snapshot.statuses, draft.snapshot.validationVisible, draft.snapshot.pending]
		}, {
			initialCommitted: ['1'],
			intermediate: [['1e-'], ['intermediate'], [false], true],
			rejected: [['1e-'], ['intermediate'], [false], true],
			valid: [['2.5'], ['complete'], [false], true]
		});
	});

	test('shares exact numeric transition policy across complete, intermediate, and impossible drafts', () => {
		const valid = [
			'0', '-0', '123', '-123', '+123', '123.45', '-123.45', '.5', '-.5', '0.', '-0.',
			'1e3', '1e-3', '1E+3', '123456789012345678901234567890', '0.00000000000000000001'
		];
		const intermediate = ['', '-', '+', '.', '-.', '+.', '1e', '1e-', '1e+'];
		const impossible = ['12xxx', '12.3.4', '1e2e3', '12 34', 'abc', 'NaN', 'Infinity'];

		for (const value of [...valid, ...intermediate]) {
			const draft = new NumericDraftController('number', ['7']);
			draft.update(0, value);
			assert.strictEqual(draft.snapshot.values[0], value);
		}
		for (const value of impossible) {
			const draft = new NumericDraftController('number', ['7']);
			draft.update(0, value);
			assert.deepStrictEqual(draft.snapshot.values, ['7']);
		}
	});

	test('commits changed complete values once and rejects incomplete values with a focus target', () => {
		const draft = new NumericDraftController('number', ['1', '2', '3']);
		draft.update(0, '4');
		const committed = draft.commit();
		const unchanged = draft.commit();
		draft.update(1, '-');
		const rejected = draft.commit();

		assert.deepStrictEqual({ committed, unchanged, rejected, snapshot: draft.snapshot }, {
			committed: { kind: 'committed', values: ['4', '2', '3'] },
			unchanged: { kind: 'unchanged' },
			rejected: { kind: 'invalid', focusIndex: 1 },
			snapshot: {
				values: ['4', '-', '3'],
				committedValues: ['4', '2', '3'],
				statuses: ['complete', 'intermediate', 'complete'],
				validationVisible: [false, true, false],
				pending: true
			}
		});
	});

	test('cancels to committed values and replaces drafts from an external authoritative update', () => {
		const draft = new NumericDraftController('integer', ['1']);
		draft.update(0, '123abc');
		assert.deepStrictEqual(draft.snapshot.values, ['1']);
		draft.cancel();
		const cancelled = draft.snapshot;
		draft.update(0, '7');
		draft.replaceCommitted(['9']);

		assert.deepStrictEqual({ cancelled, replaced: draft.snapshot }, {
			cancelled: {
				values: ['1'], committedValues: ['1'], statuses: ['complete'],
				validationVisible: [false], pending: false
			},
			replaced: {
				values: ['9'], committedValues: ['9'], statuses: ['complete'],
				validationVisible: [false], pending: false
			}
		});
	});

	test('uses the same lifecycle for scalar and compound numeric editors', () => {
		const scalar = new NumericDraftController('number', ['1']);
		const compound = new NumericDraftController('number', ['1', '2', '3', '4']);
		scalar.update(0, '.');
		compound.update(2, '.');

		assert.deepStrictEqual({
			scalar: scalar.commit(),
			compound: compound.commit(),
			scalarValidation: scalar.snapshot.validationVisible,
			compoundValidation: compound.snapshot.validationVisible
		}, {
			scalar: { kind: 'invalid', focusIndex: 0 },
			compound: { kind: 'invalid', focusIndex: 2 },
			scalarValidation: [true],
			compoundValidation: [false, false, true, false]
		});
	});
});
