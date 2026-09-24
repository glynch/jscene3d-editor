/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoringLaunchConfiguration, AuthoringService, NodeAuthoringProcessLauncher } from './authoring/authoringService';
import { publishProjectDiagnostics } from './project/projectDiagnostics';
import { localProjectPath } from './project/projectLocation';
import { ProjectState } from './project/projectState';
import { ProjectTreeDataProvider } from './project/projectView';
import { ProjectWorkspaceLifecycle } from './project/projectWorkspaceLifecycle';
import { ExtensionProjectReopenIntentStore, VsCodeProjectWorkspace } from './project/vsCodeProjectWorkspace';

const viewId = 'jscene3d.project';
const initialLayoutKey = 'initialLayoutApplied';
const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';

interface ActiveExtensionRuntime {
	readonly service: AuthoringService;
	readonly projectState: ProjectState;
	readonly workspaceLifecycle: ProjectWorkspaceLifecycle;
}

let activeRuntime: ActiveExtensionRuntime | undefined;

/** Activates and wires the built-in JScene3D authoring extension. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('JScene3D');
	const diagnostics = vscode.languages.createDiagnosticCollection('jscene3d');
	const service = new AuthoringService(authoringLaunchConfiguration, new NodeAuthoringProcessLauncher(), output);
	const projectState = new ProjectState(service, output);
	const workspaceLifecycle = new ProjectWorkspaceLifecycle(
		projectState,
		new VsCodeProjectWorkspace(),
		new ExtensionProjectReopenIntentStore(context.globalState),
		output
	);
	activeRuntime = { service, projectState, workspaceLifecycle };
	const projectProvider = new ProjectTreeDataProvider(projectState);
	const tree = vscode.window.createTreeView(viewId, { treeDataProvider: projectProvider });

	const stateSubscription = projectState.onDidChange(() => {
		const snapshot = projectState.snapshot;
		publishProjectDiagnostics(diagnostics, snapshot.diagnostics);
		void Promise.all([
			vscode.commands.executeCommand('setContext', projectOpenContext, snapshot.status === 'open'),
			vscode.commands.executeCommand('setContext', projectBusyContext,
				snapshot.status === 'opening' || snapshot.status === 'cancellingOpen' || snapshot.status === 'closing')
		]).catch(error => output.appendLine(`Failed to update JScene3D context keys: ${error instanceof Error ? error.message : String(error)}`));
	});

	context.subscriptions.push(
		output,
		diagnostics,
		service,
		projectState,
		workspaceLifecycle,
		projectProvider,
		tree,
		stateSubscription,
		vscode.commands.registerCommand('jscene3d.createProject', () => {
			return vscode.window.showInformationMessage(vscode.l10n.t('Project creation will be added in a later authoring milestone.'));
		}),
		vscode.commands.registerCommand('jscene3d.openProject', async () => {
			const selections = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: { [vscode.l10n.t('JScene3D Project')]: ['j3d'] },
				openLabel: vscode.l10n.t('Open JScene3D Project'),
				title: vscode.l10n.t('Open JScene3D Project Descriptor')
			});
			if (selections === undefined || selections.length === 0) {
				return;
			}
			try {
				localProjectPath(selections[0]);
			} catch (error) {
				output.appendLine(`Open Project command rejected the selected location: ${error instanceof Error ? error.message : String(error)}`);
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D projects must be selected from the local file system.'));
				return;
			}
			try {
				const result = await workspaceLifecycle.openProject(selections[0]);
				if (!result.project.opened) {
					await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the project. See Problems and JScene3D Output for details.'));
				}
			} catch (error) {
				output.appendLine(`Open Project command failed: ${error instanceof Error ? error.message : String(error)}`);
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the project. See JScene3D Output for details.'));
			}
		}),
		vscode.commands.registerCommand('jscene3d.closeProject', async () => {
			try {
				await workspaceLifecycle.closeProject();
			} catch (error) {
				output.appendLine(`Close Project command failed: ${error instanceof Error ? error.message : String(error)}`);
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not close the project. See JScene3D Output for details.'));
			}
		}),
		vscode.commands.registerCommand('jscene3d.gettingStarted', () => {
			return vscode.window.showInformationMessage(vscode.l10n.t('JScene3D Getting Started content will be added in a later stage.'));
		})
	);

	await vscode.commands.executeCommand('setContext', projectOpenContext, false);
	await vscode.commands.executeCommand('setContext', projectBusyContext, false);
	if (!context.globalState.get(initialLayoutKey, false)) {
		await vscode.commands.executeCommand(`${viewId}.focus`);
		const secondarySideBar = vscode.workspace.getConfiguration('workbench.secondarySideBar');
		const visibility = secondarySideBar.inspect<string>('defaultVisibility');
		if (visibility?.globalValue === undefined && visibility?.workspaceValue === undefined && secondarySideBar.get('defaultVisibility') === 'hidden') {
			await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
		}
		await context.globalState.update(initialLayoutKey, true);
	}

	const reopen = await workspaceLifecycle.reopenPendingProject();
	if (reopen.status === 'failed') {
		await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not reopen the project after the workspace changed. See Problems and JScene3D Output for details.'));
	}
}

/** Stops project callbacks before awaiting termination of the owned Java service. */
export async function deactivate(): Promise<void> {
	const runtime = activeRuntime;
	activeRuntime = undefined;
	runtime?.workspaceLifecycle.dispose();
	runtime?.projectState.dispose();
	await runtime?.service.shutdown();
}

/** Resolves the isolated development launch configuration from environment and settings. */
function authoringLaunchConfiguration(): AuthoringLaunchConfiguration {
	const configuration = vscode.workspace.getConfiguration('jscene3d.authoring');
	return {
		javaExecutable: process.env.JSCENE3D_JAVA_EXECUTABLE?.trim()
			|| configuration.get<string>('javaExecutable', 'java'),
		modulePath: process.env.JSCENE3D_AUTHORING_SERVICE_MODULE_PATH?.trim()
			|| configuration.get<string>('modulePath', '')
	};
}
