/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectLoadingSplashLifecycle } from './projectLoadingSplash';
import { ProjectWorkbenchHost, ProjectWorkbenchPresentation } from './projectWorkbench';

const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';
const projectNameContext = 'jscene3d.projectName';
const closeWelcomeWorkbenchCommandId = 'jscene3d.workbench.closeWelcome';
const completeStartupPresentationWorkbenchCommandId = 'jscene3d.workbench.completeStartupPresentation';

/** Coordinates tabless Project-ready presentation at the workbench lifecycle boundary. */
export class VsCodeProjectWorkbench implements ProjectWorkbenchHost, vscode.Disposable {
	private disposed = false;
	private startupPresentationComplete = false;

	constructor(private readonly loadingPresentation: ProjectLoadingSplashLifecycle) { }

	async show(presentation: ProjectWorkbenchPresentation): Promise<void> {
		if (this.disposed) {
			return;
		}
		switch (presentation.status) {
			case 'transition':
				await this.setProjectContext(false, true, undefined);
				return;
			case 'welcome':
				await this.setProjectContext(false, false, undefined);
				await vscode.commands.executeCommand('workbench.action.openWalkthrough');
				await this.completeStartupPresentation(true);
				return;
			case 'ready':
				await this.setProjectContext(true, false, presentation.projectName);
				await vscode.commands.executeCommand(closeWelcomeWorkbenchCommandId);
				await this.completeStartupPresentation(true);
				await this.loadingPresentation.acceptProjectWorkbenchReady();
		}
	}

	dispose(): void {
		this.disposed = true;
	}

	private async setProjectContext(open: boolean, busy: boolean, projectName: string | undefined): Promise<void> {
		if (open) {
			await vscode.commands.executeCommand('setContext', projectNameContext, projectName);
			await Promise.all([
				vscode.commands.executeCommand('setContext', projectOpenContext, true),
				vscode.commands.executeCommand('setContext', projectBusyContext, busy)
			]);
			return;
		}
		await Promise.all([
			vscode.commands.executeCommand('setContext', projectOpenContext, false),
			vscode.commands.executeCommand('setContext', projectBusyContext, busy)
		]);
		await vscode.commands.executeCommand('setContext', projectNameContext, undefined);
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
