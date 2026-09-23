/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { validateRequiredExtensions } from './builtInExtensions.ts';

const definition = {
	name: 'pub.required',
	version: '1.2.3',
	sha256: 'a'.repeat(64),
	repo: 'https://example.com/pub/required',
};

test('validates a pinned required extension', () => {
	assert.doesNotThrow(() => validateRequiredExtensions({
		requiredExtensions: ['pub.required'],
		builtInExtensions: [definition],
		builtInExtensionsEnabledWithAutoUpdates: [],
	}));
});

test('rejects missing, duplicate, unpinned, and auto-updated required extensions', () => {
	assert.throws(() => validateRequiredExtensions({ requiredExtensions: ['pub.required'], builtInExtensions: [] }), /exactly one/);
	assert.throws(() => validateRequiredExtensions({ requiredExtensions: ['pub.required', 'pub.required'], builtInExtensions: [definition] }), /duplicate/);
	assert.throws(() => validateRequiredExtensions({ requiredExtensions: ['pub.required'], builtInExtensions: [{ ...definition, sha256: '' }] }), /pinned/);
	assert.throws(() => validateRequiredExtensions({
		requiredExtensions: ['pub.required'],
		builtInExtensions: [definition],
		builtInExtensionsEnabledWithAutoUpdates: ['pub.required'],
	}), /cannot be listed/);
});
