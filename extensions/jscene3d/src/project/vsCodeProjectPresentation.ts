/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	ProjectPresentation,
	ProjectPresentationHost,
	projectPresentationHtml,
	shouldRevealStartupPresentation
} from './projectPresentation';

const projectPresentationViewType = 'jscene3d.projectPresentation';
const closeWelcomeWorkbenchCommandId = 'jscene3d.workbench.closeWelcome';
const completeStartupPresentationWorkbenchCommandId = 'jscene3d.workbench.completeStartupPresentation';

/** Owns the central loading, ready, and failure surface for the Project feature. */
export class VsCodeProjectPresentation implements ProjectPresentationHost, vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private presentation: ProjectPresentation = { status: 'welcome' };
	private readonly serializer: vscode.Disposable;
	private disposed = false;
	private startupPresentationComplete = false;

	constructor() {
		this.serializer = vscode.window.registerWebviewPanelSerializer(projectPresentationViewType, {
			deserializeWebviewPanel: async panel => this.attach(panel)
		});
	}

	async show(presentation: ProjectPresentation): Promise<void> {
		if (this.disposed) {
			return;
		}
		this.presentation = presentation;
		if (presentation.status === 'welcome') {
			this.panel?.dispose();
			this.panel = undefined;
			await vscode.commands.executeCommand('workbench.action.openWalkthrough');
			await this.completeStartupPresentation(true);
			return;
		}

		const panel = this.panel ?? this.createPanel();
		this.render(panel, presentation);
		panel.reveal(vscode.ViewColumn.Active, false);
		await vscode.commands.executeCommand(closeWelcomeWorkbenchCommandId);
		await this.completeStartupPresentation(shouldRevealStartupPresentation(presentation));
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.serializer.dispose();
		this.panel?.dispose();
		this.panel = undefined;
	}

	private createPanel(): vscode.WebviewPanel {
		const panel = vscode.window.createWebviewPanel(
			projectPresentationViewType,
			vscode.l10n.t('JScene3D Project'),
			vscode.ViewColumn.Active,
			{ enableScripts: false, retainContextWhenHidden: true }
		);
		this.attach(panel);
		return panel;
	}

	private attach(panel: vscode.WebviewPanel): void {
		if (this.presentation.status === 'welcome') {
			panel.dispose();
			return;
		}
		if (this.panel !== panel) {
			this.panel?.dispose();
		}
		this.panel = panel;
		panel.webview.options = { enableScripts: false };
		panel.onDidDispose(() => {
			if (this.panel === panel) {
				this.panel = undefined;
			}
		});
		this.render(panel, this.presentation);
	}

	private render(panel: vscode.WebviewPanel, presentation: ProjectPresentation): void {
		panel.title = presentation.status === 'loading'
			? vscode.l10n.t('Opening {0}', presentation.projectName)
			: presentation.status === 'ready'
				? presentation.projectName
				: vscode.l10n.t('Project Open Failed');
		if (presentation.status !== 'welcome') {
			panel.webview.html = projectPresentationHtml(presentation, (message, ...args) => vscode.l10n.t(message, ...args));
		}
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
