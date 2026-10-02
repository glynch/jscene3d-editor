/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import {
	AuthoringWorkflow,
	closeProjectCommandId,
	createProjectCommandId,
	gettingStartedCommandId,
	openProjectCommandId
} from './authoring/authoringWorkflow';
import { AuthoringLaunchConfiguration, AuthoringService, NodeAuthoringProcessLauncher } from './authoring/authoringService';
import { VsCodeAuthoringWorkflowHost } from './authoring/vsCodeAuthoringWorkflow';
import { AuthoredDefinitionEditorProvider } from './definition/authoredDefinitionEditor';
import { AuthoredDefinitionLifecycle } from './definition/authoredDefinitionLifecycle';
import {
	AuthoredDefinitionOpener,
	authoredDefinitionViewType,
	openDefinitionCommandId
} from './definition/authoredDefinitionOpener';
import { AuthoredDefinitionState } from './definition/authoredDefinitionState';
import { definitionResourceKey } from './definition/definitionResource';
import { HierarchyTreeDataProvider } from './hierarchy/hierarchyView';
import { hierarchyViewId } from './hierarchy/hierarchyViewModel';
import { InspectorState } from './inspector/inspectorState';
import { inspectorViewId, InspectorViewProvider, revealInspector } from './inspector/inspectorView';
import { publishProjectDiagnostics } from './project/projectDiagnostics';
import { ProjectState } from './project/projectState';
import { ProjectTreeDataProvider } from './project/projectView';
import { projectViewId } from './project/projectViewModel';
import { CoordinatedProjectDocumentLifecycle, ProjectWorkspaceLifecycle } from './project/projectWorkspaceLifecycle';
import { ExtensionProjectReopenIntentStore, VsCodeProjectWorkspace } from './project/vsCodeProjectWorkspace';
import {
	closeProjectViewportsWorkbenchCommandId,
	openProjectViewportWorkbenchCommandId,
	runProjectCommandId,
	ProjectViewportLaunch,
	ViewportWorkflow,
	ViewportWorkflowHost
} from './viewport/viewportWorkflow';

const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';
const definitionActiveContext = 'jscene3d.definitionActive';

interface ActiveExtensionRuntime {
	readonly service: AuthoringService;
	readonly projectState: ProjectState;
	readonly workspaceLifecycle: ProjectWorkspaceLifecycle;
	readonly definitionState: AuthoredDefinitionState;
	readonly inspectorState: InspectorState;
	readonly closeProjectViewports: () => Promise<void>;
}

let activeRuntime: ActiveExtensionRuntime | undefined;

/** Activates and wires the built-in JScene3D authoring extension. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('JScene3D');
	const activeDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.activeProject');
	const attemptDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.projectAttempt');
	const definitionDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.definitionAttempt');
	const viewportDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.viewportAttempt');
	const service = new AuthoringService(authoringLaunchConfiguration, new NodeAuthoringProcessLauncher(), output);
	const projectState = new ProjectState(service, output);
	const definitionState = new AuthoredDefinitionState();
	const definitionLifecycle = new AuthoredDefinitionLifecycle(
		service,
		definitionState,
		diagnostics => publishProjectDiagnostics(definitionDiagnostics, diagnostics)
	);
	const definitionEditorProvider = new AuthoredDefinitionEditorProvider(
		definitionState,
		definitionLifecycle,
		() => projectState.snapshot.status === 'open' ? projectState.snapshot.generation : undefined
	);
	const inspectorState = new InspectorState(service, definitionState);
	const projectProvider = new ProjectTreeDataProvider(projectState);
	const tree = vscode.window.createTreeView(projectViewId, { treeDataProvider: projectProvider });
	const hierarchyProvider = new HierarchyTreeDataProvider(definitionState);
	const hierarchyTree = vscode.window.createTreeView(hierarchyViewId, { treeDataProvider: hierarchyProvider });
	const inspectorProvider = new InspectorViewProvider(
		inspectorState,
		vscode.env.language,
		(message, ...args) => vscode.l10n.t(message, ...args),
		{
			mutate: async (target, candidate, label) => {
				try {
					const outcome = await definitionEditorProvider.acceptInspectorMutation(
						target, { operation: 'set', value: candidate }, label);
					if (outcome.status === 'rejected' && outcome.diagnostics.length === 0) {
						await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D rejected the edit: {0}', outcome.outcome));
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					output.appendLine(`Inspector edit failed: ${message}`);
					await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not apply the edit: {0}', message));
				}
			}
		}
	);
	const closeProjectViewports = async (): Promise<void> => {
		await vscode.commands.executeCommand(closeProjectViewportsWorkbenchCommandId);
	};
	const workspaceLifecycle = new ProjectWorkspaceLifecycle(
		projectState,
		new VsCodeProjectWorkspace(),
		new ExtensionProjectReopenIntentStore(context.globalState),
		output,
		new CoordinatedProjectDocumentLifecycle(inspectorProvider, definitionEditorProvider),
		{ closeProjectViewports }
	);
	const definitionOpener = new AuthoredDefinitionOpener(
		service,
		definitionState,
		(resource, viewType) => Promise.resolve(vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse(resource), viewType))
	);
	const workflow = new AuthoringWorkflow(
		projectState,
		workspaceLifecycle,
		definitionOpener,
		new VsCodeAuthoringWorkflowHost(definitionDiagnostics),
		output
	);
	const viewportWorkflow = new ViewportWorkflow(
		service,
		projectState,
		new VsCodeViewportWorkflowHost(viewportDiagnostics),
		output
	);
	activeRuntime = { service, projectState, workspaceLifecycle, definitionState, inspectorState, closeProjectViewports };

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
		if (snapshot.status === 'serviceUnavailable') {
			void closeProjectViewports().catch(error => output.appendLine(
				`Failed to close JScene3D project viewports: ${error instanceof Error ? error.message : String(error)}`));
		}
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
		definitionDiagnostics,
		viewportDiagnostics,
		service,
		projectState,
		workspaceLifecycle,
		workflow,
		projectProvider,
		tree,
		definitionState,
		definitionEditorProvider,
		inspectorState,
		inspectorProvider,
		hierarchyProvider,
		hierarchyTree,
		stateSubscription,
		definitionStateSubscription,
		vscode.window.registerWebviewViewProvider(inspectorViewId, inspectorProvider),
		vscode.window.tabGroups.onDidChangeTabs(updateActiveDefinition),
		vscode.window.tabGroups.onDidChangeTabGroups(updateActiveDefinition),
		hierarchyTree.onDidChangeSelection(event => {
			const selected = event.selection[0];
			if (selected !== undefined) {
				definitionState.select(selected);
				void revealInspector(command => vscode.commands.executeCommand(command))
					.catch(error => output.appendLine(`Failed to reveal JScene3D Inspector: ${error instanceof Error ? error.message : String(error)}`));
			} else {
				definitionState.clearSelection();
			}
		}),
		vscode.commands.registerCommand(createProjectCommandId, () => workflow.createProject()),
		vscode.commands.registerCommand(openProjectCommandId, () => workflow.openProject()),
		vscode.commands.registerCommand(closeProjectCommandId, () => workflow.closeProject()),
		vscode.commands.registerCommand(openDefinitionCommandId,
			(requestedAssetId?: string) => workflow.openDefinition(requestedAssetId)),
		vscode.commands.registerCommand(runProjectCommandId,
			() => viewportWorkflow.runProject()),
		vscode.commands.registerCommand(gettingStartedCommandId, () => workflow.gettingStarted())
	);

	await vscode.commands.executeCommand('setContext', projectOpenContext, false);
	await vscode.commands.executeCommand('setContext', projectBusyContext, false);
	await vscode.commands.executeCommand('setContext', definitionActiveContext, false);
	updateActiveDefinition();

	await workflow.reopenPendingProject();
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(authoredDefinitionViewType, definitionEditorProvider, {
		supportsMultipleEditorsPerDocument: true
	}));
}

/** Stops project callbacks before awaiting termination of the owned Java service. */
export async function deactivate(): Promise<void> {
	const runtime = activeRuntime;
	activeRuntime = undefined;
	runtime?.workspaceLifecycle.dispose();
	runtime?.projectState.dispose();
	runtime?.inspectorState.dispose();
	runtime?.definitionState.dispose();
	try {
		await runtime?.closeProjectViewports();
	} finally {
		await runtime?.service.shutdown();
	}
}

class VsCodeViewportWorkflowHost implements ViewportWorkflowHost {
	constructor(private readonly diagnostics: vscode.DiagnosticCollection) { }

	async open(launch: ProjectViewportLaunch): Promise<void> {
		await vscode.commands.executeCommand(openProjectViewportWorkbenchCommandId, launch);
	}

	publishDiagnostics(diagnostics: readonly import('./protocol/authoringProtocol').ProjectDiagnosticDto[]): void {
		publishProjectDiagnostics(this.diagnostics, diagnostics);
	}

	async notifyFailure(kind: 'projectRequired' | 'mainSceneRequired' | 'preparationRejected' | 'stale' | 'openFailed'): Promise<void> {
		switch (kind) {
			case 'projectRequired':
				await vscode.window.showErrorMessage(vscode.l10n.t('Open a JScene3D project before opening a native viewport.'));
				return;
			case 'mainSceneRequired':
				await vscode.window.showErrorMessage(vscode.l10n.t('Configure a valid Main Scene before running the project.'));
				return;
			case 'preparationRejected':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not prepare the Main Scene for rendering. See Problems and JScene3D Output for details.'));
				return;
			case 'stale':
				await vscode.window.showWarningMessage(vscode.l10n.t('The JScene3D project changed before the native viewport could open.'));
				return;
			case 'openFailed':
				await vscode.window.showErrorMessage(vscode.l10n.t('JScene3D could not open the native viewport. See JScene3D Output for details.'));
				return;
		}
	}
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
		runtimeArtifacts: configuredPathList(
			process.env.JSCENE3D_PROJECT_RUNTIME_ARTIFACT_PATH,
			configuration.get<readonly string[]>('runtimeArtifacts', [])),
		clientLanguage: vscode.env.language
	};
}

/** Resolves ordered descriptor-only extension artifacts independently of the JPMS module path. */
function installedExtensionMetadata(configuration: vscode.WorkspaceConfiguration): readonly string[] {
	const environmentPath = process.env.JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH;
	return configuredPathList(environmentPath, configuration.get<readonly string[]>('installedExtensionMetadata', []));
}

function configuredPathList(environmentPath: string | undefined, fallback: readonly string[]): readonly string[] {
	return environmentPath === undefined ? fallback : environmentPath.length === 0 ? [] : environmentPath.split(path.delimiter);
}
