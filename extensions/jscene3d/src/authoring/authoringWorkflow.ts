/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoredDefinitionOpenOutcome } from '../definition/authoredDefinitionOpener';
import { ProjectLocation, localProjectPath } from '../project/projectLocation';
import { ProjectSnapshot } from '../project/projectState';
import { ProjectReopenOutcome, ProjectSessionOpenResult } from '../project/projectSessionLifecycle';
import { ProjectDiagnosticDto } from '../protocol/authoringProtocol';

export const createProjectCommandId = 'jscene3d.createProject';
export const openProjectCommandId = 'jscene3d.openProject';
export const closeProjectCommandId = 'jscene3d.closeProject';
export const gettingStartedCommandId = 'jscene3d.gettingStarted';

/** User-facing interaction selected by the authoring workflow. */
export type AuthoringWorkflowNotification =
	| 'projectCreationDeferred'
	| 'gettingStartedDeferred'
	| 'localProjectRequired'
	| 'projectOpenRejected'
	| 'projectCandidateRejected'
	| 'projectReplacementConflict'
	| 'projectOpenFailed'
	| 'projectCloseFailed'
	| 'projectRequired'
	| 'definitionOpenRejected'
	| 'definitionOpenFailed'
	| 'projectReopenFailed';

/** Code OSS interactions required by the authoring workflow module. */
export interface AuthoringWorkflowHost {
	selectProjectDescriptor(): Promise<ProjectLocation | undefined>;
	publishDefinitionDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void;
	revealProject(): Promise<void>;
	notify(notification: AuthoringWorkflowNotification): Promise<void>;
}

/** Project state required to coordinate definition diagnostic lifetime. */
export interface AuthoringWorkflowProjectState {
	readonly snapshot: ProjectSnapshot;
	onDidChange(listener: () => void): { dispose(): void };
}

/** Project-session lifecycle operations coordinated by the authoring workflow. */
export interface AuthoringWorkflowProjectLifecycle {
	openProject(location: ProjectLocation): Promise<ProjectSessionOpenResult>;
	closeProject(): Promise<void>;
	reopenPersistedProject(): Promise<ProjectReopenOutcome>;
}

/** Definition operation coordinated by the authoring workflow. */
export interface AuthoringWorkflowDefinitionOpener {
	open(projectGeneration: number, projectId: string, assetId: string): Promise<AuthoredDefinitionOpenOutcome>;
}

/** Receives operational workflow messages without depending on VS Code APIs. */
export interface AuthoringWorkflowLogger {
	appendLine(message: string): void;
}

/** Owns user-triggered project and definition workflow policy. */
export class AuthoringWorkflow {
	private readonly projectSubscription: { dispose(): void };
	private diagnosticProjectGeneration: number | undefined;

	constructor(
		private readonly projectState: AuthoringWorkflowProjectState,
		private readonly projectLifecycle: AuthoringWorkflowProjectLifecycle,
		private readonly definitionOpener: AuthoringWorkflowDefinitionOpener,
		private readonly host: AuthoringWorkflowHost,
		private readonly logger: AuthoringWorkflowLogger
	) {
		this.diagnosticProjectGeneration = activeProjectGeneration(projectState.snapshot);
		this.projectSubscription = projectState.onDidChange(() => this.synchronizeProjectGeneration());
	}

	async createProject(): Promise<void> {
		await this.host.notify('projectCreationDeferred');
	}

	async openProject(): Promise<void> {
		const location = await this.host.selectProjectDescriptor();
		if (location === undefined) {
			return;
		}
		try {
			localProjectPath(location);
		} catch (error) {
			this.logger.appendLine(`Open Project command rejected the selected location: ${errorMessage(error)}`);
			await this.host.notify('localProjectRequired');
			return;
		}

		this.host.publishDefinitionDiagnostics([]);
		let result: ProjectSessionOpenResult;
		try {
			result = await this.projectLifecycle.openProject(location);
		} catch (error) {
			this.logger.appendLine(`Open Project command failed: ${errorMessage(error)}`);
			await this.host.notify('projectOpenFailed');
			return;
		}

		switch (result.status) {
			case 'opened':
			case 'replaced':
				await this.revealProject();
				return;
			case 'openRejected':
				await this.host.notify('projectOpenRejected');
				return;
			case 'candidateRejected':
				await this.host.notify('projectCandidateRejected');
				return;
			case 'conflict':
				await this.host.notify('projectReplacementConflict');
				return;
			case 'cancelled':
				return;
		}
	}

	async closeProject(): Promise<void> {
		this.host.publishDefinitionDiagnostics([]);
		try {
			await this.projectLifecycle.closeProject();
		} catch (error) {
			this.logger.appendLine(`Close Project command failed: ${errorMessage(error)}`);
			await this.host.notify('projectCloseFailed');
		}
	}

	async openDefinition(requestedAssetId?: string, expectedProjectGeneration?: number): Promise<void> {
		const snapshot = this.projectState.snapshot;
		if (snapshot.status !== 'open') {
			await this.host.notify('projectRequired');
			return;
		}

		this.host.publishDefinitionDiagnostics([]);
		if (requestedAssetId === undefined) {
			await this.host.notify('definitionOpenRejected');
			return;
		}
		if (expectedProjectGeneration !== undefined && expectedProjectGeneration !== snapshot.generation) {
			this.logger.appendLine(
				`Definition open rejected: Project generation ${expectedProjectGeneration} is stale; active generation is ${snapshot.generation}`
			);
			await this.host.notify('definitionOpenRejected');
			return;
		}
		const assetId = requestedAssetId;
		let outcome: AuthoredDefinitionOpenOutcome;
		try {
			outcome = await this.definitionOpener.open(snapshot.generation, snapshot.project.id, assetId);
		} catch (error) {
			this.logger.appendLine(`Open Definition command failed: ${errorMessage(error)}`);
			await this.host.notify('definitionOpenFailed');
			return;
		}

		this.host.publishDefinitionDiagnostics(outcome.diagnostics);
		if (outcome.status === 'rejected') {
			this.logger.appendLine(`Definition open rejected: ${outcome.failureCode ?? 'Java definition validation failed'}`);
			await this.host.notify('definitionOpenRejected');
		}
	}

	async gettingStarted(): Promise<void> {
		await this.host.notify('gettingStartedDeferred');
	}

	async reopenPersistedProject(): Promise<void> {
		const outcome = await this.projectLifecycle.reopenPersistedProject();
		if (outcome.status === 'failed') {
			await this.host.notify('projectReopenFailed');
		} else if (outcome.status === 'reopened') {
			await this.revealProject();
		}
	}

	dispose(): void {
		this.projectSubscription.dispose();
	}

	private synchronizeProjectGeneration(): void {
		const generation = activeProjectGeneration(this.projectState.snapshot);
		if (generation === this.diagnosticProjectGeneration) {
			return;
		}
		this.diagnosticProjectGeneration = generation;
		this.host.publishDefinitionDiagnostics([]);
	}

	private async revealProject(): Promise<void> {
		try {
			await this.host.revealProject();
		} catch (error) {
			this.logger.appendLine(`Failed to reveal JScene3D Project: ${errorMessage(error)}`);
		}
	}
}

function activeProjectGeneration(snapshot: ProjectSnapshot): number | undefined {
	return snapshot.status === 'open'
		? snapshot.generation
		: undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
