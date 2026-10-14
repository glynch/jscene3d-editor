/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export function isFiniteDecimalString(value: unknown): value is string {
	return typeof value === 'string'
		&& /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
		&& Number.isFinite(Number(value));
}
