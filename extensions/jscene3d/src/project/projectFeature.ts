/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	AuthoringWorkflow,
	AuthoringWorkflowDefinitionOpener,
	closeProjectCommandId,
	createProjectCommandId,
	gettingStartedCommandId,
	openProjectCommandId
} from '../authoring/authoringWorkflow';
import { VsCodeAuthoringWorkflowHost } from '../authoring/vsCodeAuthoringWorkflow';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { ProjectDiagnosticDto } from '../protocol/authoringProtocol';
import { publishProjectDiagnostics } from './projectDiagnostics';
import { ProjectState } from './projectState';
import { ProjectTreeDataProvider } from './projectView';
import { projectViewId } from './projectViewModel';
import {
	CoordinatedProjectDocumentLifecycle,
	ProjectDocumentLifecycle,
	ProjectDocumentPreparation,
	ProjectViewportLifecycle,
	ProjectWorkspaceLifecycle
} from './projectWorkspaceLifecycle';
import { ExtensionProjectReopenIntentStore, VsCodeProjectWorkspace } from './vsCodeProjectWorkspace';

const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';

/** Definition operations coordinated by the Project feature. */
export interface ProjectDefinitionFeature extends ProjectDocumentLifecycle {
	readonly opener: AuthoringWorkflowDefinitionOpener;
	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void;
	registerOpenCommand(handler: (assetId?: string, projectGeneration?: number) => Promise<void>): void;
}

/** Project feature activation owned by the extension composition root. */
export interface RegisteredProjectFeature extends vscode.Disposable {
	readonly ready: Promise<void>;
	reopenPendingProject(): Promise<void>;
}

/** Registers Project presentation, commands, diagnostics, workspace coordination, and context state. */
export function registerProjectFeature(
	globalState: vscode.Memento,
	projectState: ProjectState,
	definitionState: AuthoredDefinitionState,
	definitions: ProjectDefinitionFeature,
	inspector: ProjectDocumentPreparation,
	viewports: ProjectViewportLifecycle,
	logger: { appendLine(message: string): void }
): RegisteredProjectFeature {
	return new VsCodeProjectFeature(
		globalState,
		projectState,
		definitionState,
		definitions,
		inspector,
		viewports,
		logger
	);
}

class VsCodeProjectFeature implements RegisteredProjectFeature {
	readonly ready: Promise<void>;
	private readonly activeDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.activeProject');
	private readonly attemptDiagnostics = vscode.languages.createDiagnosticCollection('jscene3d.projectAttempt');
	private readonly workspaceLifecycle: ProjectWorkspaceLifecycle;
	private readonly workflow: AuthoringWorkflow;
	private readonly disposables: vscode.Disposable[] = [];
	private disposed = false;

	constructor(
		globalState: vscode.Memento,
		projectState: ProjectState,
		definitionState: AuthoredDefinitionState,
		definitions: ProjectDefinitionFeature,
		inspector: ProjectDocumentPreparation,
		viewports: ProjectViewportLifecycle,
		private readonly logger: { appendLine(message: string): void }
	) {
		const provider = new ProjectTreeDataProvider(projectState);
		const tree = vscode.window.createTreeView(projectViewId, { treeDataProvider: provider });
		this.workspaceLifecycle = new ProjectWorkspaceLifecycle(
			projectState,
			new VsCodeProjectWorkspace(),
			new ExtensionProjectReopenIntentStore(globalState),
			logger,
			new CoordinatedProjectDocumentLifecycle(inspector, definitions),
			viewports
		);
		this.workflow = new AuthoringWorkflow(
			projectState,
			this.workspaceLifecycle,
			definitions.opener,
			new VsCodeAuthoringWorkflowHost(diagnostics => definitions.publishDiagnostics(diagnostics)),
			logger
		);
		definitions.registerOpenCommand((assetId, projectGeneration) =>
			this.workflow.openDefinition(assetId, projectGeneration));
		this.disposables.push(
			this.activeDiagnostics,
			this.attemptDiagnostics,
			provider,
			tree,
			projectState.onDidChange(() => this.projectStateChanged(projectState, definitionState, viewports)),
			vscode.commands.registerCommand(createProjectCommandId, () => this.workflow.createProject()),
			vscode.commands.registerCommand(openProjectCommandId, () => this.workflow.openProject()),
			vscode.commands.registerCommand(closeProjectCommandId, () => this.workflow.closeProject()),
			vscode.commands.registerCommand(gettingStartedCommandId, () => this.workflow.gettingStarted())
		);
		this.ready = Promise.all([
			vscode.commands.executeCommand('setContext', projectOpenContext, false),
			vscode.commands.executeCommand('setContext', projectBusyContext, false)
		]).then(() => undefined);
	}

	reopenPendingProject(): Promise<void> {
		return this.workflow.reopenPendingProject();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const disposable of this.disposables.reverse()) {
			disposable.dispose();
		}
		this.workflow.dispose();
		this.workspaceLifecycle.dispose();
	}

	private projectStateChanged(
		projectState: ProjectState,
		definitionState: AuthoredDefinitionState,
		viewports: ProjectViewportLifecycle
	): void {
		const snapshot = projectState.snapshot;
		publishProjectDiagnostics(this.activeDiagnostics, snapshot.activeDiagnostics);
		publishProjectDiagnostics(this.attemptDiagnostics, snapshot.attemptDiagnostics);
		const projectOpen = snapshot.status === 'open'
			|| snapshot.status === 'replacing'
			|| snapshot.status === 'closing';
		definitionState.setProjectGeneration(projectOpen ? snapshot.generation : undefined);
		if (snapshot.status === 'serviceUnavailable') {
			void viewports.closeProjectViewports().catch(error => this.logger.appendLine(
				`Failed to close JScene3D project viewports: ${errorMessage(error)}`));
		}
		void Promise.all([
			vscode.commands.executeCommand('setContext', projectOpenContext, projectOpen),
			vscode.commands.executeCommand(
				'setContext',
				projectBusyContext,
				snapshot.status === 'opening'
					|| snapshot.status === 'cancellingOpen'
					|| snapshot.status === 'replacing'
					|| snapshot.status === 'closing'
			)
		]).catch(error => this.logger.appendLine(
			`Failed to update JScene3D context keys: ${errorMessage(error)}`));
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
