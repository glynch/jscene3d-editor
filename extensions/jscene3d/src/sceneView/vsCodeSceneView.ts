/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { publishProjectDiagnostics } from '../project/projectDiagnostics';
import { ProjectDiagnosticDto, SceneViewSnapshotDto } from '../protocol/authoringProtocol';
import {
	SceneViewportLaunch,
	SceneViewAuthoringClient,
	SceneViewHost,
	SceneViewLifecycle,
	SceneViewSynchronizationOutcome
} from './sceneViewLifecycle';
import { SceneViewLifecycleOperations, SceneViewRegistration } from './sceneViewRegistration';

const updateSceneViewWorkbenchCommandId = 'jscene3d.workbench.updateSceneView';
const closeViewportWorkbenchCommandId = 'jscene3d.workbench.closeViewport';
const openSceneEditorWorkbenchCommandId = 'jscene3d.workbench.openSceneEditor';

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
	return new RegisteredVsCodeSceneViewFeature(registration, diagnostics);
}

class RegisteredVsCodeSceneViewFeature implements RegisteredSceneViewFeature {
	constructor(
		private readonly registration: SceneViewRegistration,
		private readonly diagnostics: vscode.DiagnosticCollection
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

	dispose(): void {
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

	async close(viewportId: string): Promise<void> {
		await vscode.commands.executeCommand(closeViewportWorkbenchCommandId, viewportId);
	}

	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void {
		publishProjectDiagnostics(this.diagnostics, diagnostics);
	}
}
