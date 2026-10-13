/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { compileDesktopStandaloneFiles } from '../desktopStandalone.ts';

suite('desktop standalone compilation', () => {
	test('bundles imported preload modules into a CommonJS entry point', async () => {
		const repoRoot = path.resolve(import.meta.dirname, '../../..');
		const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-standalone-'));

		try {
			await compileDesktopStandaloneFiles(repoRoot, path.relative(repoRoot, destination), false);

			const preload = fs.readFileSync(path.join(
				destination,
				'vs/base/parts/sandbox/electron-browser/preload.js'
			), 'utf8');

			assert.match(preload, /"use strict"/);
			assert.doesNotMatch(preload, /^\s*import\s/m);
			assert.doesNotMatch(preload, /^\s*export\s/m);
		} finally {
			fs.rmSync(destination, { recursive: true, force: true });
		}
	});
});
