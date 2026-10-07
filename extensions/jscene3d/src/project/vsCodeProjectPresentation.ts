/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ProjectLoadingSplashLifecycle } from './projectLoadingSplash';
import {
	ProjectPresentation,
	ProjectPresentationActivation,
	ProjectPresentationDocument,
	ProjectPresentationHost,
	ProjectPresentationReady,
	isProjectPresentationReady,
	shouldRevealStartupPresentation
} from './projectPresentation';

const projectPresentationViewType = 'jscene3d.projectPresentation';
const closeWelcomeWorkbenchCommandId = 'jscene3d.workbench.closeWelcome';
const completeStartupPresentationWorkbenchCommandId = 'jscene3d.workbench.completeStartupPresentation';

/** Owns the central loading, ready, and failure surface for the Project feature. */
export class VsCodeProjectPresentation implements ProjectPresentationHost, vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private document: ProjectPresentationDocument | undefined;
	private activation: ProjectPresentationActivation | undefined;
	private presentation: ProjectPresentation = { status: 'welcome' };
	private readonly serializer: vscode.Disposable;
	private disposed = false;
	private startupPresentationComplete = false;

	constructor(
		private readonly logger: { appendLine(message: string): void },
		private readonly loadingPresentation: ProjectLoadingSplashLifecycle
	) {
		this.serializer = vscode.window.registerWebviewPanelSerializer(projectPresentationViewType, {
			deserializeWebviewPanel: async panel => this.attach(panel)
		});
	}

	async show(presentation: ProjectPresentation): Promise<void> {
		if (this.disposed) {
			return;
		}
		this.presentation = presentation;
		if (presentation.status === 'loading' && this.loadingPresentation.active) {
			return;
		}
		if (presentation.status === 'welcome') {
			this.activation?.dispose();
			this.document?.dispose();
			this.panel?.dispose();
			this.panel = undefined;
			this.document = undefined;
			this.activation = undefined;
			await vscode.commands.executeCommand('workbench.action.openWalkthrough');
			await this.completeStartupPresentation(true);
			return;
		}

		const panel = this.panel;
		if (panel === undefined) {
			this.createPanel();
		} else {
			this.updateTitle(panel, presentation);
			if (this.document === undefined) {
				throw new Error('JScene3D Project presentation document is unavailable');
			}
			await this.document.update(presentation);
		}
		const activePanel = this.panel;
		if (activePanel === undefined) {
			throw new Error('JScene3D Project presentation panel was not created');
		}
		if (!this.activation?.active) {
			return;
		}
		activePanel.reveal(vscode.ViewColumn.Active, false);
		await vscode.commands.executeCommand(closeWelcomeWorkbenchCommandId);
		await this.completeStartupPresentation(shouldRevealStartupPresentation(presentation));
		await this.loadingPresentation.acceptProjectPresentationReady();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.serializer.dispose();
		this.activation?.dispose();
		this.document?.dispose();
		this.panel?.dispose();
		this.panel = undefined;
		this.document = undefined;
		this.activation = undefined;
	}

	private createPanel(): vscode.WebviewPanel {
		const panel = vscode.window.createWebviewPanel(
			projectPresentationViewType,
			vscode.l10n.t('JScene3D Project'),
			{
				viewColumn: vscode.ViewColumn.Active,
				preserveFocus: true,
				initializeInBackground: true
			},
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		try {
			this.attach(panel);
		} catch (error) {
			panel.dispose();
			throw error;
		}
		return panel;
	}

	private attach(panel: vscode.WebviewPanel): void {
		if (this.presentation.status === 'welcome') {
			panel.dispose();
			return;
		}
		if (this.panel !== panel) {
			this.activation?.dispose();
			this.document?.dispose();
			this.panel?.dispose();
		}
		this.panel = panel;
		panel.webview.options = { enableScripts: true };
		this.updateTitle(panel, this.presentation);
		const activation = new ProjectPresentationActivation({
			reveal: () => panel.reveal(vscode.ViewColumn.Active, false),
			closeWelcome: async () => {
				await vscode.commands.executeCommand(closeWelcomeWorkbenchCommandId);
			},
			completeStartupPresentation: revealApplicationSplash => this.completeStartupPresentation(revealApplicationSplash)
		});
		this.activation = activation;
		const document = new ProjectPresentationDocument(
			{
				initializeDocument: html => {
					panel.webview.html = html;
				},
				postMessage: message => {
					return panel.webview.postMessage(message);
				}
			},
			this.presentation,
			(message, ...args) => vscode.l10n.t(message, ...args),
			randomBytes(16).toString('base64')
		);
		panel.webview.onDidReceiveMessage(message => {
			if (isProjectPresentationReady(message)) {
				void this.acceptRenderedReady(panel, document, activation, message);
			}
		});
		this.document = document;
		panel.onDidDispose(() => {
			if (this.panel === panel) {
				activation.dispose();
				document.dispose();
				this.panel = undefined;
				this.document = undefined;
				this.activation = undefined;
			}
		});
	}

	private async acceptRenderedReady(
		panel: vscode.WebviewPanel,
		document: ProjectPresentationDocument,
		activation: ProjectPresentationActivation,
		message: ProjectPresentationReady
	): Promise<void> {
		try {
			await document.acceptReady(message);
			if (this.disposed || this.panel !== panel || this.document !== document || this.activation !== activation) {
				return;
			}
			await activation.acceptRenderedReady(shouldRevealStartupPresentation(this.presentation));
			await this.loadingPresentation.acceptProjectPresentationReady();
		} catch (error) {
			this.logger.appendLine(`Failed to initialize JScene3D Project presentation: ${errorMessage(error)}`);
			if (!activation.active && this.panel === panel && this.activation === activation) {
				activation.dispose();
				panel.dispose();
			}
		}
	}

	private updateTitle(
		panel: vscode.WebviewPanel,
		presentation: Exclude<ProjectPresentation, { readonly status: 'welcome' }>
	): void {
		panel.title = presentation.status === 'loading'
			? vscode.l10n.t('Opening {0}', presentation.projectName)
			: presentation.status === 'ready'
				? vscode.l10n.t('JScene3D Project')
				: vscode.l10n.t('Project Open Failed');
	}

	private async completeStartupPresentation(revealApplicationSplash: boolean): Promise<void> {
		if (this.startupPresentationComplete) {
			return;
		}
		this.startupPresentationComplete = await vscode.commands.executeCommand<boolean>(
			completeStartupPresentationWorkbenchCommandId,
			revealApplicationSplash
		) ?? false;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
