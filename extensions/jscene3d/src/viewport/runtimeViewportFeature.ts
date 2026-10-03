/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { publishProjectDiagnostics } from '../project/projectDiagnostics';
import { ProjectState } from '../project/projectState';
import { ProjectDiagnosticDto } from '../protocol/authoringProtocol';
import {
	closeProjectViewportsWorkbenchCommandId,
	openProjectViewportWorkbenchCommandId,
	ProjectViewportLaunch,
	runProjectCommandId,
	ViewportAuthoringClient,
	ViewportWorkflow,
	ViewportWorkflowHost
} from './viewportWorkflow';

/** Runtime/Game View lifecycle exposed to Project transitions and extension shutdown. */
export interface RegisteredRuntimeViewportFeature extends vscode.Disposable {
	closeProjectViewports(): Promise<void>;
}

/** Registers Run Project, runtime viewport diagnostics, and the VS Code workflow host. */
export function registerRuntimeViewportFeature(
	client: ViewportAuthoringClient,
	projectState: ProjectState,
	logger: { appendLine(message: string): void }
): RegisteredRuntimeViewportFeature {
	return new VsCodeRuntimeViewportFeature(client, projectState, logger);
}

class VsCodeRuntimeViewportFeature implements RegisteredRuntimeViewportFeature {
	private readonly diagnostics = vscode.languages.createDiagnosticCollection('jscene3d.viewportAttempt');
	private readonly command: vscode.Disposable;
	private disposed = false;

	constructor(
		client: ViewportAuthoringClient,
		projectState: ProjectState,
		logger: { appendLine(message: string): void }
	) {
		const workflow = new ViewportWorkflow(
			client,
			projectState,
			new VsCodeViewportWorkflowHost(this.diagnostics),
			logger
		);
		this.command = vscode.commands.registerCommand(runProjectCommandId, () => workflow.runProject());
	}

	async closeProjectViewports(): Promise<void> {
		await vscode.commands.executeCommand(closeProjectViewportsWorkbenchCommandId);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.command.dispose();
		this.diagnostics.dispose();
	}
}

class VsCodeViewportWorkflowHost implements ViewportWorkflowHost {
	constructor(private readonly diagnostics: vscode.DiagnosticCollection) { }

	async open(launch: ProjectViewportLaunch): Promise<void> {
		await vscode.commands.executeCommand(openProjectViewportWorkbenchCommandId, launch);
	}

	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void {
		publishProjectDiagnostics(this.diagnostics, diagnostics);
	}

	async notifyFailure(kind: 'projectRequired' | 'mainSceneRequired' | 'preparationRejected' | 'stale' | 'openFailed'): Promise<void> {
		switch (kind) {
			case 'projectRequired':
				await vscode.window.showErrorMessage(vscode.l10n.t(
					'Open a JScene3D project before opening a native viewport.'));
				return;
			case 'mainSceneRequired':
				await vscode.window.showErrorMessage(vscode.l10n.t(
					'Configure a valid Main Scene before running the project.'));
				return;
			case 'preparationRejected':
				await vscode.window.showErrorMessage(vscode.l10n.t(
					'JScene3D could not prepare the Main Scene for rendering. See Problems and JScene3D Output for details.'));
				return;
			case 'stale':
				await vscode.window.showWarningMessage(vscode.l10n.t(
					'The JScene3D project changed before the native viewport could open.'));
				return;
			case 'openFailed':
				await vscode.window.showErrorMessage(vscode.l10n.t(
					'JScene3D could not open the native viewport. See JScene3D Output for details.'));
				return;
		}
	}
}
