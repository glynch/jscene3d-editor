/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { AuthoringLaunchConfiguration, AuthoringService, NodeAuthoringProcessLauncher } from './authoring/authoringService';
import { AuthoredDefinitionEditorProvider } from './definition/authoredDefinitionEditor';
import { AuthoredDefinitionOpener, authoredDefinitionViewType } from './definition/authoredDefinitionOpener';
import { AuthoredDefinitionState } from './definition/authoredDefinitionState';
import { definitionResourceKey } from './definition/definitionResource';
import { HierarchyTreeDataProvider } from './hierarchy/hierarchyView';
import { publishProjectDiagnostics } from './project/projectDiagnostics';
import { localProjectPath } from './project/projectLocation';
import { ProjectState } from './project/projectState';
import { ProjectTreeDataProvider } from './project/projectView';
import { ProjectWorkspaceLifecycle } from './project/projectWorkspaceLifecycle';
import { ExtensionProjectReopenIntentStore, VsCodeProjectWorkspace } from './project/vsCodeProjectWorkspace';

const viewId = 'jscene3d.project';
const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';
const definitionActiveContext = 'jscene3d.definitionActive';

interface ActiveExtensionRuntime {
	readonly service: AuthoringService;
	readonly projectState: ProjectState;
	readonly workspaceLifecycle: ProjectWorkspaceLifecycle;
	readonly definitionState: AuthoredDefinitionState;
}

let activeRuntime: ActiveExtensionRuntime | undefined;

/** Activates and wires the built-in JScene3D authoring extension. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('JScene3D');
	const activeDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.activeProject');
	const attemptDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.projectAttempt');
	const service = new AuthoringService(authoringLaunchConfiguration, new NodeAuthoringProcessLauncher(), output);
	const projectState = new ProjectState(service, output);
	const workspaceLifecycle = new ProjectWorkspaceLifecycle(
		projectState,
		new VsCodeProjectWorkspace(),
		new ExtensionProjectReopenIntentStore(context.globalState),
		output
	);
	const definitionState = new AuthoredDefinitionState();
	const definitionOpener = new AuthoredDefinitionOpener(
		service,
		definitionState,
		(resource, viewType) => Promise.resolve(vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse(resource), viewType))
	);
	activeRuntime = { service, projectState, workspaceLifecycle, definitionState };
	const projectProvider = new ProjectTreeDataProvider(projectState);
	const tree = vscode.window.createTreeView(viewId, { treeDataProvider: projectProvider });
	const hierarchyProvider = new HierarchyTreeDataProvider(definitionState);
	const hierarchyTree = vscode.window.createTreeView('jscene3d.hierarchy', { treeDataProvider: hierarchyProvider });
	const definitionEditorProvider = new AuthoredDefinitionEditorProvider(definitionState);

	const updateActiveDefinition = () => {
		const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
		definitionState.activate(
			input instanceof vscode.TabInputCustom && input.viewType === authoredDefinitionViewType
				? definitionResourceKey(input.uri)
				: undefined
		);
	};

	const stateSubscription = projectState.onDidChange(() => {
		const snapshot = projectState.snapshot;
		publishProjectDiagnostics(activeDiagnostics, snapshot.activeDiagnostics);
		publishProjectDiagnostics(attemptDiagnostics, snapshot.attemptDiagnostics);
		const projectOpen = snapshot.status === 'open' || snapshot.status === 'replacing' || snapshot.status === 'closing';
		definitionState.setProjectGeneration(projectOpen ? snapshot.generation : undefined);
		void Promise.all([
			vscode.commands.executeCommand('setContext', projectOpenContext, projectOpen),
			vscode.commands.executeCommand('setContext', projectBusyContext,
				snapshot.status === 'opening' || snapshot.status === 'cancellingOpen'
					|| snapshot.status === 'replacing' || snapshot.status === 'closing')
		]).catch(error => output.appendLine(`Failed to update JScene3D context keys: ${error instanceof Error ? error.message : String(error)}`));
	});
	const definitionStateSubscription = definitionState.onDidChange(() => {
		void Promise.resolve(vscode.commands.executeCommand('setContext', definitionActiveContext, definitionState.active !== undefined))
			.catch((error: unknown) => output.appendLine(`Failed to update JScene3D definition context: ${error instanceof Error ? error.message : String(error)}`));
	});

	context.subscriptions.push(
		output,
		activeDiagnostics,
		attemptDiagnostics,
		service,
		projectState,
		workspaceLifecycle,
		projectProvider,
		tree,
		definitionState,
		hierarchyProvider,
		hierarchyTree,
		stateSubscription,
		definitionStateSubscription,
		vscode.window.registerCustomEditorProvider(authoredDefinitionViewType, definitionEditorProvider, {
			supportsMultipleEditorsPerDocument: true
		}),
		vscode.window.tabGroups.onDidChangeTabs(updateActiveDefinition),
		vscode.window.tabGroups.onDidChangeTabGroups(updateActiveDefinition),
		hierarchyTree.onDidChangeSelection(event => {
			const selected = event.selection[0];
			if (selected !== undefined) {
				definitionState.select(selected);
			}
		}),
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
				if (result.project.operation === 'open' && !result.project.result.opened) {
					await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the project. See Problems and JScene3D Output for details.'));
				} else if (result.project.operation === 'replace' && result.project.result.outcome === 'candidateRejected') {
					await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the selected project. See Problems for details.'));
				} else if (result.project.operation === 'replace' && result.project.result.outcome === 'conflict') {
					await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not replace the current project because the authoring session changed. See JScene3D Output for details.'));
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
		vscode.commands.registerCommand('jscene3d.openDefinition', async (requestedAssetId?: string) => {
			const snapshot = projectState.snapshot;
			if (snapshot.status !== 'open') {
				await vscode.window.showErrorMessage(vscode.l10n.t('Open a JScene3D project before opening a definition.'));
				return;
			}
			const assetId = requestedAssetId ?? snapshot.project.startupWorld.id;
			try {
				await definitionOpener.open(snapshot.generation, assetId);
			} catch (error) {
				output.appendLine(`Open Definition command failed: ${error instanceof Error ? error.message : String(error)}`);
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the definition. See JScene3D Output for details.'));
			}
		}),
		vscode.commands.registerCommand('jscene3d.gettingStarted', () => {
			return vscode.window.showInformationMessage(vscode.l10n.t('JScene3D Getting Started content will be added in a later stage.'));
		})
	);

	await vscode.commands.executeCommand('setContext', projectOpenContext, false);
	await vscode.commands.executeCommand('setContext', projectBusyContext, false);
	await vscode.commands.executeCommand('setContext', definitionActiveContext, false);
	updateActiveDefinition();

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
	runtime?.definitionState.dispose();
	await runtime?.service.shutdown();
}

/** Resolves the isolated development launch configuration from environment and settings. */
function authoringLaunchConfiguration(): AuthoringLaunchConfiguration {
	const configuration = vscode.workspace.getConfiguration('jscene3d.authoring');
	return {
		javaExecutable: process.env.JSCENE3D_JAVA_EXECUTABLE?.trim()
			|| configuration.get<string>('javaExecutable', 'java'),
		modulePath: process.env.JSCENE3D_AUTHORING_SERVICE_MODULE_PATH?.trim()
			|| configuration.get<string>('modulePath', ''),
		installedExtensionMetadata: installedExtensionMetadata(configuration),
		clientLanguage: vscode.env.language
	};
}

/** Resolves ordered descriptor-only extension artifacts independently of the JPMS module path. */
function installedExtensionMetadata(configuration: vscode.WorkspaceConfiguration): readonly string[] {
	const environmentPath = process.env.JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH;
	if (environmentPath !== undefined) {
		return environmentPath.length === 0 ? [] : environmentPath.split(path.delimiter);
	}
	return configuration.get<readonly string[]>('installedExtensionMetadata', []);
}
