/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('JScene3D authored definition editor', () => {
	test('keeps both static documents script-free with a restrictive CSP', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '..', '..', 'src', 'definition', 'authoredDefinitionEditor.ts'),
			'utf8'
		);

		assert.match(source, /Content-Security-Policy/);
		assert.match(source, /default-src \\'none\\'/);
		assert.strictEqual(source.match(/\$\{restrictiveContentSecurityPolicy\}/g)?.length, 2);
		assert.match(source, /enableScripts: false/);
	});

	test('implements the native editable CustomDocument lifecycle', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '..', '..', 'src', 'definition', 'authoredDefinitionEditor.ts'),
			'utf8'
		);

		assert.match(source, /implements vscode\.CustomEditorProvider<AuthoredDefinitionDocument>/);
		assert.match(source, /EventEmitter<vscode\.CustomDocumentEditEvent<AuthoredDefinitionDocument>>/);
		assert.match(source, /changeEmitter\.fire\(\{/);
		assert.match(source, /undo: outcome\.edit\.undo/);
		assert.match(source, /redo: outcome\.edit\.redo/);
		assert.match(source, /saveCustomDocument/);
		assert.match(source, /revertCustomDocument/);
		assert.match(source, /backupCustomDocument/);
		assert.match(source, /lifecycle\.recover/);
		assert.match(source, /tabGroups\.close\(tabs\)/);
		assert.match(source, /await this\.waitForPendingMutations\(\)/);
		assert.match(source, /tab\.isDirty/);
		assert.doesNotMatch(source, /tabs\.length === 0 \|\| vscode\.window\.tabGroups\.close/);
	});

	test('reopens the persisted project before registering restored custom editors', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '..', '..', 'src', 'extension.ts'),
			'utf8'
		);

		const reopen = source.lastIndexOf('await workflow.reopenPendingProject()');
		const registration = source.lastIndexOf('vscode.window.registerCustomEditorProvider');
		assert.ok(reopen >= 0, 'project reopen must remain part of activation');
		assert.ok(registration > reopen, 'restored custom editors must wait for the active project generation');
	});
});
