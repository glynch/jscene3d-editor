/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoringTextDto } from '../protocol/authoringProtocol';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from './authoredDefinitionState';
import { definitionResourceKey } from './definitionResource';

/** Read-only document whose lifetime does not own or discard Java retained-definition state. */
class AuthoredDefinitionDocument implements vscode.CustomDocument {
	constructor(readonly uri: vscode.Uri, readonly definition: AuthoredDefinitionResource | undefined) { }

	dispose(): void { }
}

/** Minimal supported custom-editor surface establishing authored-definition tab identity and lifecycle. */
export class AuthoredDefinitionEditorProvider implements vscode.CustomReadonlyEditorProvider<AuthoredDefinitionDocument> {
	constructor(private readonly state: AuthoredDefinitionState) { }

	openCustomDocument(uri: vscode.Uri): AuthoredDefinitionDocument {
		return new AuthoredDefinitionDocument(uri, this.state.resolve(definitionResourceKey(uri)));
	}

	resolveCustomEditor(document: AuthoredDefinitionDocument, webviewPanel: vscode.WebviewPanel): void {
		webviewPanel.webview.options = { enableScripts: false };
		const definition = document.definition;
		if (definition === undefined) {
			webviewPanel.webview.html = inactiveDocumentHtml();
			return;
		}
		const context = definition.snapshot.context;
		webviewPanel.webview.html = documentHtml(context.label, context.kind, context.editable);
	}
}

/** Renders a restored tab without associating it with a different project generation. */
function inactiveDocumentHtml(): string {
	const title = escapeHtml(vscode.l10n.t('Definition unavailable'));
	const message = escapeHtml(vscode.l10n.t('This JScene3D definition belongs to a project session that is no longer active.'));
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

/** Renders intentionally minimal, script-free read-only document content. */
function documentHtml(label: AuthoringTextDto, kind: string, editable: boolean): string {
	const title = escapeHtml(label.text);
	const kindText = escapeHtml(kind === 'world-definition'
		? vscode.l10n.t('World Definition')
		: vscode.l10n.t('Entity Definition'));
	const mode = escapeHtml(editable ? vscode.l10n.t('Authored') : vscode.l10n.t('Generated, read-only'));
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><main><h1>${title}</h1><p>${kindText}</p><p>${mode}</p></main></body></html>`;
}

/** Escapes authored text before inserting it into the static custom-editor document. */
function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
			'\'': '&#39;'
	})[character] ?? character);
}
