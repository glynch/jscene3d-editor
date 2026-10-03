/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DefinitionMutationOutcome } from '../definition/authoredDefinitionLifecycle';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { DefinitionMutationDto, InspectorMutationTargetDto } from '../protocol/authoringProtocol';
import { InspectorReader, InspectorState } from './inspectorState';
import { inspectorViewId, InspectorViewProvider, revealInspector } from './inspectorView';

/** Definition mutation boundary consumed by Inspector registration. */
export interface InspectorDefinitionEditor {
	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome>;
}

/** Inspector capabilities consumed by Project close and Hierarchy selection. */
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
	private readonly provider: InspectorViewProvider;
	private readonly registration: vscode.Disposable;
	private disposed = false;

	constructor(
		reader: InspectorReader,
		definitions: AuthoredDefinitionState,
		editor: InspectorDefinitionEditor,
		private readonly logger: { appendLine(message: string): void }
	) {
		this.state = new InspectorState(reader, definitions);
		this.provider = new InspectorViewProvider(
			this.state,
			vscode.env.language,
			(message, ...args) => vscode.l10n.t(message, ...args),
			{
				mutate: async (target, candidate, label) => {
					try {
						const outcome = await editor.acceptInspectorMutation(
							target, { operation: 'set', value: candidate }, label);
						if (outcome.status === 'rejected' && outcome.diagnostics.length === 0) {
							await vscode.window.showErrorMessage(vscode.l10n.t(
								'JScene3D rejected the edit: {0}', outcome.outcome));
						}
					} catch (error) {
						const message = errorMessage(error);
						this.logger.appendLine(`Inspector edit failed: ${message}`);
						await vscode.window.showErrorMessage(vscode.l10n.t(
							'JScene3D could not apply the edit: {0}', message));
					}
				}
			}
		);
		this.registration = vscode.window.registerWebviewViewProvider(inspectorViewId, this.provider);
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
		this.registration.dispose();
		this.provider.dispose();
		this.state.dispose();
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
