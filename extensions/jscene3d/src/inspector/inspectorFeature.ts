/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { InspectorDefinitionEditor, InspectorEditCoordinator } from './inspectorEditCoordinator';
import { InspectorReader, InspectorState } from './inspectorState';
import { InspectorSelectionReveal } from './inspectorSelectionReveal';
import { inspectorViewId, InspectorViewProvider, revealInspector, revealInspectorAutomatically } from './inspectorView';

/** Inspector capabilities consumed by Project close and supporting editor features. */
export interface RegisteredInspectorFeature extends vscode.Disposable {
	prepareForDocumentClose(): Promise<boolean>;
	reveal(): Promise<void>;
}

/** Registers Inspector state, webview presentation, mutation handling, and reveal behavior. */
export function registerInspectorFeature(
	reader: InspectorReader,
	definitions: AuthoredDefinitionState,
	editor: InspectorDefinitionEditor,
	logger: { appendLine(message: string): void }
): RegisteredInspectorFeature {
	return new VsCodeInspectorFeature(reader, definitions, editor, logger);
}

class VsCodeInspectorFeature implements RegisteredInspectorFeature {
	private readonly state: InspectorState;
	private readonly edits: InspectorEditCoordinator;
	private readonly provider: InspectorViewProvider;
	private readonly registration: vscode.Disposable;
	private readonly selectionReveal: InspectorSelectionReveal;
	private disposed = false;

	constructor(
		reader: InspectorReader,
		definitions: AuthoredDefinitionState,
		editor: InspectorDefinitionEditor,
		private readonly logger: { appendLine(message: string): void }
	) {
		this.state = new InspectorState(reader, definitions);
		this.edits = new InspectorEditCoordinator(this.state, definitions, editor, {
			rejected: async (label, reason) => {
				await vscode.window.showErrorMessage(vscode.l10n.t(
					'JScene3D rejected {0}: {1}', label, reason));
			},
			failed: async error => {
				const message = errorMessage(error);
				this.logger.appendLine(`Inspector edit failed: ${message}`);
				await vscode.window.showErrorMessage(vscode.l10n.t(
					'JScene3D could not apply the edit: {0}', message));
			}
		});
		this.provider = new InspectorViewProvider(
			this.state,
			vscode.env.language,
			(message, ...args) => vscode.l10n.t(message, ...args),
			this.edits
		);
		this.registration = vscode.window.registerWebviewViewProvider(inspectorViewId, this.provider);
		this.selectionReveal = new InspectorSelectionReveal(
			definitions,
			() => this.provider.visible,
			() => revealInspectorAutomatically(command => vscode.commands.executeCommand(command)),
			error => this.logger.appendLine(`Failed to reveal JScene3D Inspector: ${errorMessage(error)}`)
		);
	}

	prepareForDocumentClose(): Promise<boolean> {
		return this.provider.prepareForDocumentClose();
	}

	async reveal(): Promise<void> {
		try {
			await revealInspector(command => vscode.commands.executeCommand(command));
		} catch (error) {
			this.logger.appendLine(`Failed to reveal JScene3D Inspector: ${errorMessage(error)}`);
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.selectionReveal.dispose();
		this.registration.dispose();
		this.provider.dispose();
		this.edits.dispose();
		this.state.dispose();
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
