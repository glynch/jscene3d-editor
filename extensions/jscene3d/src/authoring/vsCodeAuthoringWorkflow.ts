/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { revealJScene3DProject } from '../hierarchy/hierarchyViewModel';
import { ProjectLocation } from '../project/projectLocation';
import { ProjectDiagnosticDto } from '../protocol/authoringProtocol';
import { AuthoringWorkflowHost, AuthoringWorkflowNotification } from './authoringWorkflow';

/** Adapts Code OSS project selection, Problems, localization, and notifications to the workflow. */
export class VsCodeAuthoringWorkflowHost implements AuthoringWorkflowHost {
	constructor(private readonly publishDiagnostics: (diagnostics: readonly ProjectDiagnosticDto[]) => void) { }

	async selectProjectDescriptor(): Promise<ProjectLocation | undefined> {
		const selections = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: { [vscode.l10n.t('JScene3D Project')]: ['j3d'] },
			openLabel: vscode.l10n.t('Open JScene3D Project'),
			title: vscode.l10n.t('Open JScene3D Project Descriptor')
		});
		return selections?.[0];
	}

	publishDefinitionDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void {
		this.publishDiagnostics(diagnostics);
	}

	async revealProject(): Promise<void> {
		await revealJScene3DProject(command => vscode.commands.executeCommand(command));
	}

	async notify(notification: AuthoringWorkflowNotification): Promise<void> {
		switch (notification) {
			case 'projectCreationDeferred':
				await vscode.window.showInformationMessage(vscode.l10n.t('Project creation will be added in a later authoring milestone.'));
				return;
			case 'gettingStartedDeferred':
				await vscode.window.showInformationMessage(vscode.l10n.t('JScene3D Getting Started content will be added in a later stage.'));
				return;
			case 'localProjectRequired':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D projects must be selected from the local file system.'));
				return;
			case 'projectOpenRejected':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the project. See Problems and JScene3D Output for details.'));
				return;
			case 'projectCandidateRejected':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the selected project. See Problems for details.'));
				return;
			case 'projectReplacementConflict':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not replace the current project because the authoring session changed. See JScene3D Output for details.'));
				return;
			case 'projectOpenFailed':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the project. See JScene3D Output for details.'));
				return;
			case 'projectCloseFailed':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not close the project. See JScene3D Output for details.'));
				return;
			case 'projectRequired':
				await vscode.window.showErrorMessage(vscode.l10n.t('Open a JScene3D project before opening a definition.'));
				return;
			case 'definitionOpenRejected':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the definition. See Problems and JScene3D Output for details.'));
				return;
			case 'definitionOpenFailed':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the definition. See JScene3D Output for details.'));
				return;
			case 'projectReopenFailed':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not reopen the previous project. See Problems and JScene3D Output for details.'));
				return;
		}
	}
}
