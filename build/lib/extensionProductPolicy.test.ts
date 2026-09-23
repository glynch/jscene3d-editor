/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { getExcludedBuiltinExtensionIds, isExcludedBuiltinExtension } from './extensionProductPolicy.ts';

test('matches excluded extension IDs canonically', () => {
	const excluded = getExcludedBuiltinExtensionIds({ excludedBuiltInExtensions: ['vscode.typescript'] });
	assert.strictEqual(isExcludedBuiltinExtension({ publisher: 'vscode', name: 'typescript' }, excluded), true);
	assert.strictEqual(isExcludedBuiltinExtension({ publisher: 'vscode', name: 'javascript' }, excluded), false);
});

test('accepts an absent policy and rejects invalid lists', () => {
	assert.strictEqual(getExcludedBuiltinExtensionIds({}).size, 0);
	assert.throws(() => getExcludedBuiltinExtensionIds({ excludedBuiltInExtensions: ['VSCode.TypeScript'] }), /canonical lower-case/);
	assert.throws(() => getExcludedBuiltinExtensionIds({ excludedBuiltInExtensions: ['vscode.typescript', 'vscode.typescript'] }), /duplicate/);
});
