/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { revealInspector, revealInspectorAutomatically } from '../inspector/inspectorView';
import { inspectorWebviewHtml } from '../inspector/inspectorWebviewDocument';

suite('JScene3D Inspector view', () => {
	test('reveals the Inspector through its generated view focus command', async () => {
		const commands: string[] = [];

		await revealInspector(command => {
			commands.push(command);
		});

		assert.deepStrictEqual(commands, ['jscene3d.inspector.focus']);
	});

	test('requests selection-triggered reveal through the intent-aware workbench command', async () => {
		const commands: string[] = [];

		await revealInspectorAutomatically(command => {
			commands.push(command);
		});

		assert.deepStrictEqual(commands, ['jscene3d.workbench.revealInspectorAutomatically']);
	});

	test('creates a restrictive self-contained webview document with extracted styles and renderer', () => {
		const html = inspectorWebviewHtml('vscode-webview://test', 'document-a', 'en');
		const script = scriptContent(html);

		assert.match(html, /default-src 'none'/);
		assert.match(html, /style-src 'nonce-[^']+'/);
		assert.match(html, /script-src 'nonce-[^']+'/);
		assert.match(html, /img-src vscode-webview:\/\/test data:/);
		assert.match(html, /html, body, #app \{[^}]*height: 100%[^}]*overflow: hidden/);
		assert.match(html, /\.inspector-scroll \{[^}]*overflow-y: auto/);
		assert.match(script, /const NumericDraftController = class NumericDraftController/);
		assert.match(script, /const runInspectorWebview = function runInspectorWebview/);
		assert.match(script, /const documentId = "document-a"/);
		assert.match(script, /window\.addEventListener\('message'/);
		assert.doesNotMatch(script, /\brequire\s*\(|[A-Za-z_$][\w$]*_1\./);
		assert.doesNotThrow(() => new Function(script));
		assert.doesNotMatch(html, /onclick=/);
	});

	test('escapes document identity and attributes without weakening CSP', () => {
		const html = inspectorWebviewHtml(
			'source&quot;<bad>', '</script><script>bad()</script>', 'en"><script>bad()</script>');

		assert.match(html, /<html lang="en&quot;&gt;&lt;script&gt;bad\(\)&lt;\/script&gt;">/);
		assert.ok(html.includes('source&amp;quot;&lt;bad&gt;'));
		assert.ok(html.includes('\\u003c/script>\\u003cscript>bad()\\u003c/script>'));
		assert.strictEqual((html.match(/<script/g) ?? []).length, 1);
	});
});

function scriptContent(html: string): string {
	const match = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(html);
	assert.ok(match);
	return match[1];
}
