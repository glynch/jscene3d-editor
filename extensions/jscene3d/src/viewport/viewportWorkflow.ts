/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { ProjectSnapshot } from '../project/projectState';
import { ConnectionScopedResult, ProjectDiagnosticDto, ViewportLaunchResultDto } from '../protocol/authoringProtocol';

export const openStartupWorldViewportCommandId = 'jscene3d.openStartupWorldViewport';
export const openProjectViewportWorkbenchCommandId = 'jscene3d.workbench.openProjectViewport';
export const closeProjectViewportsWorkbenchCommandId = 'jscene3d.workbench.closeProjectViewports';

/** Java operation required to prepare one authoritative project-world launch. */
export interface ViewportAuthoringClient {
	prepareViewportLaunch(
		expectedProjectGeneration: number,
		worldAssetId: string
	): Promise<ConnectionScopedResult<ViewportLaunchResultDto>>;
}

/** Stable project state observed before and after the asynchronous Java request. */
export interface ViewportProjectState {
	readonly snapshot: ProjectSnapshot;
}

/** Workbench and presentation boundary for project viewport operations. */
export interface ViewportWorkflowHost {
	open(launch: ProjectViewportLaunch): Promise<void>;
	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void;
	notifyFailure(kind: 'projectRequired' | 'preparationRejected' | 'stale' | 'openFailed'): Promise<void>;
}

/** Closed launch value accepted by the trusted Code OSS native viewport bridge. */
export interface ProjectViewportLaunch {
	readonly viewportId: string;
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly worldAssetId: string;
	readonly worldName: string;
	readonly runtimeArtifacts: readonly string[];
}

/** Coordinates Java preparation with a generation-safe workbench editor open. */
export class ViewportWorkflow {
	constructor(
		private readonly client: ViewportAuthoringClient,
		private readonly projectState: ViewportProjectState,
		private readonly host: ViewportWorkflowHost,
		private readonly logger: { appendLine(message: string): void },
		private readonly createViewportId: () => string = randomUUID
	) { }

	async openStartupWorld(): Promise<void> {
		const initial = this.projectState.snapshot;
		if (initial.status !== 'open') {
			await this.host.notifyFailure('projectRequired');
			return;
		}

		this.host.publishDiagnostics([]);
		let scoped: ConnectionScopedResult<ViewportLaunchResultDto>;
		try {
			scoped = await this.client.prepareViewportLaunch(initial.generation, initial.project.startupWorld.id);
		} catch (error) {
			this.logger.appendLine(`Native viewport preparation failed: ${errorMessage(error)}`);
			await this.host.notifyFailure('openFailed');
			return;
		}

		const result = scoped.result;
		this.host.publishDiagnostics(result.diagnostics);
		if (!result.prepared) {
			this.logger.appendLine(`Native viewport preparation rejected: ${result.failureCode ?? 'Java project validation failed'}`);
			await this.host.notifyFailure('preparationRejected');
			return;
		}

		const current = this.projectState.snapshot;
		if (!isSameOpenProject(current, initial.generation, initial.project.id, initial.project.startupWorld.id)) {
			this.logger.appendLine('Discarding stale native viewport launch after the active project changed');
			await this.host.notifyFailure('stale');
			return;
		}

		try {
			await this.host.open({
				viewportId: this.createViewportId(),
				connectionGeneration: scoped.connectionGeneration,
				...result.launch
			});
		} catch (error) {
			this.logger.appendLine(`Native viewport open failed: ${errorMessage(error)}`);
			await this.host.notifyFailure('openFailed');
		}
	}
}

function isSameOpenProject(
	snapshot: ProjectSnapshot,
	generation: number,
	projectId: string,
	worldAssetId: string
): boolean {
	return snapshot.status === 'open'
		&& snapshot.generation === generation
		&& snapshot.project.id === projectId
		&& snapshot.project.startupWorld.id === worldAssetId;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
