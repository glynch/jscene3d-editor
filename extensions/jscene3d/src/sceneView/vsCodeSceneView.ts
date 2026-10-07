/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { publishProjectDiagnostics } from '../project/projectDiagnostics';
import { ProjectDiagnosticDto, SceneViewOccurrenceDto, SceneViewSnapshotDto } from '../protocol/authoringProtocol';
import {
	SceneViewportLaunch,
	SceneViewAuthoringClient,
	SceneViewHost,
	SceneViewLifecycle,
	SceneViewSelectionEvent,
	SceneViewSynchronizationOutcome
} from './sceneViewLifecycle';
import { SceneViewLifecycleOperations, SceneViewRegistration } from './sceneViewRegistration';

const updateSceneViewWorkbenchCommandId = 'jscene3d.workbench.updateSceneView';
const closeViewportWorkbenchCommandId = 'jscene3d.workbench.closeViewport';
const openSceneEditorWorkbenchCommandId = 'jscene3d.workbench.openSceneEditor';
const selectSceneViewWorkbenchCommandId = 'jscene3d.workbench.selectSceneView';
const acceptSceneViewSelectionCommandId = 'jscene3d.acceptSceneViewSelection';

/** Registered Scene View feature owned by extension activation. */
export interface RegisteredSceneViewFeature extends SceneViewLifecycleOperations, vscode.Disposable { }

/** Creates the VS Code adapters, diagnostics, and definition-state registration for Safe Scene View. */
export function registerSceneViewFeature(
	client: SceneViewAuthoringClient,
	definitionState: AuthoredDefinitionState,
	logger: { appendLine(message: string): void }
): RegisteredSceneViewFeature {
	const diagnostics = vscode.languages.createDiagnosticCollection('jscene3d.sceneView');
	const lifecycle = new SceneViewLifecycle(client, new VsCodeSceneViewHost(diagnostics), logger);
	const registration = new SceneViewRegistration(definitionState, lifecycle, logger);
	const selectionCommand = vscode.commands.registerCommand(acceptSceneViewSelectionCommandId, value => {
		const event = sceneViewSelectionEvent(value);
		return event !== undefined && registration.acceptSelection(event);
	});
	return new RegisteredVsCodeSceneViewFeature(registration, diagnostics, selectionCommand);
}

class RegisteredVsCodeSceneViewFeature implements RegisteredSceneViewFeature {
	constructor(
		private readonly registration: SceneViewRegistration,
		private readonly diagnostics: vscode.DiagnosticCollection,
		private readonly selectionCommand: vscode.Disposable
	) { }

	synchronize(definition: Parameters<SceneViewRegistration['synchronize']>[0]): Promise<SceneViewSynchronizationOutcome> {
		return this.registration.synchronize(definition);
	}

	close(resource: string): Promise<void> {
		return this.registration.close(resource);
	}

	closeAll(): Promise<void> {
		return this.registration.closeAll();
	}

	acceptSelection(event: SceneViewSelectionEvent): boolean {
		return this.registration.acceptSelection(event);
	}

	dispose(): void {
		this.selectionCommand.dispose();
		this.registration.dispose();
		this.diagnostics.dispose();
	}
}

class VsCodeSceneViewHost implements SceneViewHost {
	constructor(private readonly diagnostics: vscode.DiagnosticCollection) { }

	async open(ownerResource: string, launch: SceneViewportLaunch): Promise<void> {
		await vscode.commands.executeCommand(openSceneEditorWorkbenchCommandId, ownerResource, launch);
	}

	async update(viewportId: string, snapshot: SceneViewSnapshotDto): Promise<boolean | undefined> {
		return vscode.commands.executeCommand<boolean | undefined>(updateSceneViewWorkbenchCommandId, viewportId, snapshot);
	}

	async select(viewportId: string, revision: number, occurrence: SceneViewOccurrenceDto | null): Promise<boolean | undefined> {
		return vscode.commands.executeCommand<boolean | undefined>(
			selectSceneViewWorkbenchCommandId,
			viewportId,
			revision,
			occurrence
		);
	}

	async close(viewportId: string): Promise<void> {
		await vscode.commands.executeCommand(closeViewportWorkbenchCommandId, viewportId);
	}

	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void {
		publishProjectDiagnostics(this.diagnostics, diagnostics);
	}
}

function sceneViewSelectionEvent(value: unknown): SceneViewSelectionEvent | undefined {
	if (value === null || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as Partial<SceneViewSelectionEvent>;
	if (typeof candidate.viewportId !== 'string' || typeof candidate.connectionGeneration !== 'string'
		|| !Number.isInteger(candidate.projectGeneration) || candidate.projectGeneration! <= 0
		|| typeof candidate.sceneAssetId !== 'string' || !Number.isInteger(candidate.revision) || candidate.revision! < 0
		|| (candidate.occurrence !== null && !sceneViewOccurrence(candidate.occurrence))) {
		return undefined;
	}
	return candidate as SceneViewSelectionEvent;
}

function sceneViewOccurrence(value: unknown): value is SceneViewOccurrenceDto {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<SceneViewOccurrenceDto>;
	return typeof candidate.rootDefinitionAssetId === 'string'
		&& Array.isArray(candidate.entityPath)
		&& candidate.entityPath.length > 0
		&& candidate.entityPath.every(entity => typeof entity === 'string' && entity.length > 0);
}
