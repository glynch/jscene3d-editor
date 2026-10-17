/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import { NumericDraftController } from './numericDraftController';
import { runInspectorWebview } from './inspectorWebviewRenderer';
import { createInspectorPropertyRenderer } from './inspectorWebviewPropertyRenderer';
import { inspectorWebviewStyles } from './inspectorWebviewStyles';
import { numericInputPatterns, numericInputStatus } from './propertyEditorResolver';

/** Creates an opaque identity for one Inspector browser document instance. */
export function createInspectorDocumentIdentity(): string {
	return randomBytes(16).toString('hex');
}

/** Creates one restrictive Inspector webview document around the extracted browser renderer. */
export function inspectorWebviewHtml(
	cspSource: string,
	documentId: string,
	language: string
): string {
	const nonce = randomBytes(16).toString('base64');
	return `<!DOCTYPE html>
<html lang="${escapeAttribute(language)}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${escapeAttribute(cspSource)} data:;">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style nonce="${nonce}">${inspectorWebviewStyles}</style>
</head>
<body>
	<main id="app" aria-live="polite"></main>
	<script nonce="${nonce}">${browserScript(documentId)}</script>
</body>
</html>`;
}

function browserScript(documentId: string): string {
	const controllerSource = NumericDraftController.toString()
		.replace(/\(0,\s*[A-Za-z_$][\w$]*_1\.numericInputStatus\)/g, 'numericInputStatus');
	const propertyRendererSource = createInspectorPropertyRenderer.toString()
		.replace(/\b[A-Za-z_$][\w$]*_1\.NumericDraftController\b/g, 'NumericDraftController');
	const rendererSource = runInspectorWebview.toString()
		.replace(/\(0,\s*[A-Za-z_$][\w$]*_1\.createInspectorPropertyRenderer\)/g, 'createInspectorPropertyRenderer');
	return `
const documentId = ${safeJson(documentId)};
const numericInputPatterns = ${numericInputPatterns.toString()};
const numericInputStatus = ${numericInputStatus.toString()};
const NumericDraftController = ${controllerSource};
const createInspectorPropertyRenderer = ${propertyRendererSource};
const runInspectorWebview = ${rendererSource};
runInspectorWebview(documentId, {
	document,
	host: acquireVsCodeApi(),
	addHostMessageListener: listener => window.addEventListener('message', event => listener(event.data))
});`;
}

function safeJson(value: object | string): string {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
