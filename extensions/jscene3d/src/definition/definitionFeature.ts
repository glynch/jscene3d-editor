/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoringService } from '../authoring/authoringService';
import {
	DefinitionMutationDto,
	InspectorMutationTargetDto,
	ProjectDiagnosticDto
} from '../protocol/authoringProtocol';
import { publishProjectDiagnostics } from '../project/projectDiagnostics';
import { ProjectState } from '../project/projectState';
import { SceneViewLifecycleOperations } from '../sceneView/sceneViewRegistration';
import { AuthoredDefinitionEditorProvider } from './authoredDefinitionEditor';
import { AuthoredDefinitionLifecycle, DefinitionMutationOutcome } from './authoredDefinitionLifecycle';
import {
	AuthoredDefinitionOpener,
	authoredDefinitionViewType,
	isDefinitionViewType,
	openDefinitionCommandId,
	sceneDefinitionViewType
} from './authoredDefinitionOpener';
import { AuthoredDefinitionState } from './authoredDefinitionState';
import { definitionResourceKey } from './definitionResource';

const openDefinitionEditorWorkbenchCommandId = 'jscene3d.workbench.openDefinitionEditor';

/** Definition operations exposed narrowly to Project and Inspector feature registrations. */
export interface RegisteredDefinitionFeature extends vscode.Disposable {
	readonly ready: Promise<void>;
	readonly opener: AuthoredDefinitionOpener;
	closeProjectDocuments(): Promise<boolean>;
	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome>;
	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void;
	registerOpenCommand(handler: (assetId?: string, projectGeneration?: number) => Promise<void>): void;
	registerEditorProvider(): void;
}

/** Registers authored-definition state, editor lifecycle, commands, and active-tab synchronization. */
export function registerDefinitionFeature(
	service: AuthoringService,
	projectState: ProjectState,
	state: AuthoredDefinitionState,
	sceneViews: SceneViewLifecycleOperations,
	logger: { appendLine(message: string): void }
): RegisteredDefinitionFeature {
	return new VsCodeDefinitionFeature(service, projectState, state, sceneViews, logger);
}

class VsCodeDefinitionFeature implements RegisteredDefinitionFeature {
	readonly ready: Promise<void>;
	readonly opener: AuthoredDefinitionOpener;
	private readonly diagnostics = vscode.languages.createDiagnosticCollection('jscene3d.definitionAttempt');
	private readonly editorProvider: AuthoredDefinitionEditorProvider;
	private readonly disposables: vscode.Disposable[] = [];
	private openCommandRegistered = false;
	private editorProviderRegistered = false;
	private disposed = false;

	constructor(
		service: AuthoringService,
		projectState: ProjectState,
		state: AuthoredDefinitionState,
		sceneViews: SceneViewLifecycleOperations,
		private readonly logger: { appendLine(message: string): void }
	) {
		const lifecycle = new AuthoredDefinitionLifecycle(
			service,
			state,
			diagnostics => this.publishDiagnostics(diagnostics)
		);
		this.editorProvider = new AuthoredDefinitionEditorProvider(
			state,
			lifecycle,
			() => projectState.snapshot.status === 'open'
				? { generation: projectState.snapshot.generation, id: projectState.snapshot.project.id }
				: undefined,
			sceneViews
		);
		this.opener = new AuthoredDefinitionOpener(
			service,
			state,
			(resource, viewType, label) => Promise.resolve(vscode.commands.executeCommand(
				openDefinitionEditorWorkbenchCommandId, resource, viewType, label)),
			logger
		);
		const updateActiveDefinition = () => {
			const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
			state.activate(
				input instanceof vscode.TabInputCustom && isDefinitionViewType(input.viewType)
					? definitionResourceKey(input.uri)
					: undefined
			);
		};
		this.disposables.push(
			this.diagnostics,
			this.editorProvider,
			state.onDidChange(() => {
				void Promise.resolve(vscode.commands.executeCommand(
					'setContext', 'jscene3d.definitionActive', state.active !== undefined
				)).catch(error => this.logger.appendLine(
					`Failed to update JScene3D definition context: ${errorMessage(error)}`));
			}),
			vscode.window.tabGroups.onDidChangeTabs(updateActiveDefinition),
			vscode.window.tabGroups.onDidChangeTabGroups(updateActiveDefinition)
		);
		this.ready = Promise.resolve(vscode.commands.executeCommand(
			'setContext', 'jscene3d.definitionActive', false
		)).then(updateActiveDefinition);
	}

	closeProjectDocuments(): Promise<boolean> {
		return this.editorProvider.closeProjectDocuments();
	}

	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		return this.editorProvider.acceptInspectorMutation(target, mutation, label);
	}

	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void {
		publishProjectDiagnostics(this.diagnostics, diagnostics);
	}

	registerOpenCommand(handler: (assetId?: string, projectGeneration?: number) => Promise<void>): void {
		if (this.openCommandRegistered) {
			throw new Error('The authored-definition command is already registered');
		}
		this.openCommandRegistered = true;
		this.disposables.push(vscode.commands.registerCommand(
			openDefinitionCommandId,
			(requestedAssetId?: string, expectedProjectGeneration?: number) =>
				handler(requestedAssetId, expectedProjectGeneration)
		));
	}

	registerEditorProvider(): void {
		if (this.editorProviderRegistered) {
			throw new Error('The authored-definition editor provider is already registered');
		}
		this.editorProviderRegistered = true;
		const options = { supportsMultipleEditorsPerDocument: true };
		this.disposables.push(
			vscode.window.registerCustomEditorProvider(
				authoredDefinitionViewType, this.editorProvider.providerFor(authoredDefinitionViewType), options),
			vscode.window.registerCustomEditorProvider(
				sceneDefinitionViewType, this.editorProvider.providerFor(sceneDefinitionViewType), options)
		);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const disposable of this.disposables.reverse()) {
			disposable.dispose();
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
