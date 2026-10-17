/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { numericInputStatus } from './propertyEditorResolver';

export type NumericDraftStatus = 'complete' | 'intermediate' | 'invalid';

/** Immutable observable state for one scalar or compound numeric editor. */
export interface NumericDraftSnapshot {
	readonly values: readonly string[];
	readonly committedValues: readonly string[];
	readonly statuses: readonly NumericDraftStatus[];
	readonly validationVisible: readonly boolean[];
	readonly pending: boolean;
}

/** Outcome of attempting to commit one scalar or compound numeric draft. */
export type NumericDraftCommitResult =
	| { readonly kind: 'committed'; readonly values: readonly string[] }
	| { readonly kind: 'unchanged' }
	| { readonly kind: 'invalid'; readonly focusIndex: number };

/** Result of proposing one browser-local numeric draft transition. */
export type NumericDraftTransitionResult =
	| { readonly kind: 'accepted'; readonly status: Exclude<NumericDraftStatus, 'invalid'> }
	| { readonly kind: 'rejected'; readonly value: string };

/** Owns the shared local editing lifecycle for scalar and compound numeric controls. */
export class NumericDraftController {
	private values: string[];
	private committedValues: string[];
	private validationVisible: boolean[];

	constructor(
		private readonly kind: 'integer' | 'number',
		initialValues: readonly string[]
	) {
		this.values = [...initialValues];
		this.committedValues = [...initialValues];
		this.validationVisible = initialValues.map(() => false);
	}

	get snapshot(): NumericDraftSnapshot {
		return {
			values: [...this.values],
			committedValues: [...this.committedValues],
			statuses: this.values.map(value => numericInputStatus(this.kind, value)),
			validationVisible: [...this.validationVisible],
			pending: !this.sameValues(this.values, this.committedValues)
		};
	}

	classify(value: string): NumericDraftStatus {
		return numericInputStatus(this.kind, value);
	}

	update(index: number, value: string): NumericDraftTransitionResult {
		this.requireIndex(index);
		const status = this.classify(value);
		if (status === 'invalid') {
			return { kind: 'rejected', value: this.values[index] };
		}
		this.values[index] = value;
		this.validationVisible[index] = false;
		return { kind: 'accepted', status };
	}

	commit(): NumericDraftCommitResult {
		const statuses = this.values.map(value => numericInputStatus(this.kind, value));
		this.validationVisible = statuses.map(status => status !== 'complete');
		const focusIndex = statuses.findIndex(status => status !== 'complete');
		if (focusIndex >= 0) {
			return { kind: 'invalid', focusIndex };
		}
		if (this.sameValues(this.values, this.committedValues)) {
			return { kind: 'unchanged' };
		}
		this.committedValues = [...this.values];
		return { kind: 'committed', values: [...this.values] };
	}

	cancel(): void {
		this.values = [...this.committedValues];
		this.validationVisible = this.values.map(() => false);
	}

	replaceCommitted(values: readonly string[]): void {
		this.values = [...values];
		this.committedValues = [...values];
		this.validationVisible = values.map(() => false);
	}

	private requireIndex(index: number): void {
		if (!Number.isSafeInteger(index) || index < 0 || index >= this.values.length) {
			throw new RangeError(`Numeric draft field index ${index} is out of range`);
		}
	}

	private sameValues(left: readonly string[], right: readonly string[]): boolean {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}
}
