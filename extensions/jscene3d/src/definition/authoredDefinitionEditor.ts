/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoringTextDto, DefinitionContextDto, DefinitionMutationDto, InspectorMutationTargetDto } from '../protocol/authoringProtocol';
import { AuthoredDefinitionLifecycle, DefinitionMutationOutcome } from './authoredDefinitionLifecycle';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from './authoredDefinitionState';
import { definitionResourceKey } from './definitionResource';

const restrictiveContentSecurityPolicy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\';">';

/** Native editable document whose semantic state remains owned by the Java working copy. */
export class AuthoredDefinitionDocument implements vscode.CustomDocument {
	constructor(
		readonly uri: vscode.Uri,
		readonly definition: AuthoredDefinitionResource | undefined,
		private readonly release: () => void = () => undefined
	) { }

	dispose(): void {
		this.release();
	}
}

/** Bridges Java working-copy operations into the native VS Code custom-document lifecycle. */
export class AuthoredDefinitionEditorProvider implements vscode.CustomEditorProvider<AuthoredDefinitionDocument>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<AuthoredDefinitionDocument>>();
	private readonly documents = new Map<string, AuthoredDefinitionDocument>();
	private readonly pendingMutations = new Set<Promise<DefinitionMutationOutcome>>();
	readonly onDidChangeCustomDocument = this.changeEmitter.event;

	constructor(
		private readonly state: AuthoredDefinitionState,
		private readonly lifecycle: AuthoredDefinitionLifecycle,
		private readonly currentProjectGeneration: () => number | undefined
	) { }

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken
	): Promise<AuthoredDefinitionDocument> {
		const resource = definitionResourceKey(uri);
		if (openContext.backupId !== undefined) {
			const generation = this.currentProjectGeneration();
			const assetId = definitionAssetId(uri);
			if (generation !== undefined && assetId !== undefined) {
				const backup = await vscode.workspace.fs.readFile(vscode.Uri.parse(openContext.backupId));
				await this.lifecycle.recover(resource, generation, assetId, Buffer.from(backup).toString('base64'));
			}
		}
		const document = new AuthoredDefinitionDocument(uri, this.state.resolve(resource), () => this.documents.delete(resource));
		this.documents.set(resource, document);
		return document;
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

	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		const pending = this.applyInspectorMutation(target, mutation, label);
		this.pendingMutations.add(pending);
		void pending.then(
			() => this.pendingMutations.delete(pending),
			() => this.pendingMutations.delete(pending)
		);
		return pending;
	}

	private async applyInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		const outcome = await this.lifecycle.mutate(target, mutation, label);
		if (outcome.status !== 'accepted') {
			return outcome;
		}
		const active = this.state.active;
		if (active === undefined) {
			throw new Error('Accepted Inspector mutation has no active definition document');
		}
		const document = this.documents.get(active.resource);
		if (document === undefined) {
			throw new Error('Accepted Inspector mutation has no open custom document');
		}
		const nativeDirty = this.waitForNativeDirty(document);
		this.changeEmitter.fire({
			document,
			label: outcome.edit.label,
			undo: outcome.edit.undo,
			redo: outcome.edit.redo
		});
		await nativeDirty;
		return outcome;
	}

	async closeProjectDocuments(): Promise<boolean> {
		await this.waitForPendingMutations();
		const tabs = this.authoredDefinitionTabs();
		if (tabs.length === 0) {
			if (this.documents.size > 0) {
				throw new Error('Open JScene3D authored documents were not found in the native tab model');
			}
			return true;
		}
		return vscode.window.tabGroups.close(tabs);
	}

	dispose(): void {
		this.documents.clear();
		this.changeEmitter.dispose();
	}

	async saveCustomDocument(document: AuthoredDefinitionDocument): Promise<void> {
		await this.lifecycle.save(definitionResourceKey(document.uri));
	}

	saveCustomDocumentAs(): Promise<void> {
		return Promise.reject(new Error('Save As is not supported for JScene3D authored definitions'));
	}

	async revertCustomDocument(document: AuthoredDefinitionDocument): Promise<void> {
		await this.lifecycle.revert(definitionResourceKey(document.uri));
	}

	async backupCustomDocument(
		document: AuthoredDefinitionDocument,
		context: vscode.CustomDocumentBackupContext
	): Promise<vscode.CustomDocumentBackup> {
		const backup = await this.lifecycle.backup(definitionResourceKey(document.uri));
		await vscode.workspace.fs.writeFile(context.destination, Buffer.from(backup, 'base64'));
		return {
			id: context.destination.toString(true),
			delete: () => vscode.workspace.fs.delete(context.destination)
		};
	}

	private authoredDefinitionTabs(resource?: string): readonly vscode.Tab[] {
		return vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => {
			const input = tab.input;
			return input instanceof vscode.TabInputCustom
				&& input.viewType === 'jscene3d.authoredDefinition'
				&& (resource === undefined || definitionResourceKey(input.uri) === resource);
		});
	}

	private async waitForPendingMutations(): Promise<void> {
		while (this.pendingMutations.size > 0) {
			await Promise.all(this.pendingMutations);
		}
	}

	private waitForNativeDirty(document: AuthoredDefinitionDocument): Promise<void> {
		const resource = definitionResourceKey(document.uri);
		const isDirty = () => this.authoredDefinitionTabs(resource).some(tab => tab.isDirty);
		if (isDirty()) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			let completed = false;
			const complete = (error?: Error) => {
				if (completed) {
					return;
				}
				completed = true;
				clearTimeout(timeout);
				subscription.dispose();
				if (error === undefined) {
					resolve();
				} else {
					reject(error);
				}
			};
			const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
				if (isDirty()) {
					complete();
				}
			});
			const timeout = setTimeout(() => complete(new Error(
				'VS Code did not register the accepted authored-definition edit as dirty')), 2000);
		});
	}
}

function definitionAssetId(uri: vscode.Uri): string | undefined {
	const value = new URL(uri.toString(true)).searchParams.get('jscene3dAssetId');
	return value === null || value.length === 0 ? undefined : value;
}

/** Renders a restored tab without associating it with a different project generation. */
function inactiveDocumentHtml(): string {
	const title = escapeHtml(vscode.l10n.t('Definition unavailable'));
	const message = escapeHtml(vscode.l10n.t('This JScene3D definition belongs to a project session that is no longer active.'));
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${restrictiveContentSecurityPolicy}</head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

/** Renders intentionally minimal, script-free read-only document content. */
function documentHtml(label: AuthoringTextDto, kind: DefinitionContextDto['kind'], editable: boolean): string {
	const title = escapeHtml(label.text);
	const kindText = escapeHtml(definitionKindText(kind));
	const mode = escapeHtml(editable ? vscode.l10n.t('Authored') : vscode.l10n.t('Generated, read-only'));
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${restrictiveContentSecurityPolicy}</head><body><main><h1>${title}</h1><p>${kindText}</p><p>${mode}</p></main></body></html>`;
}

function definitionKindText(kind: DefinitionContextDto['kind']): string {
	switch (kind) {
		case 'scene-definition':
			return vscode.l10n.t('Scene Definition');
		case 'entity-definition':
			return vscode.l10n.t('Entity Definition');
	}
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
