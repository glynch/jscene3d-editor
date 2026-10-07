/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import { ProjectLocation, localProjectPath } from './projectLocation';
import { ProjectLoadingSplashOperation } from './projectLoadingSplash';
import { ProjectSelectionResult, ProjectSnapshot } from './projectState';

/** Stable local resource representation used by Project-session persistence. */
export interface ProjectSessionResource {
	readonly uri: string;
	readonly fsPath: string;
}

/** Converts stable local paths and URIs without consulting the Code OSS workspace. */
export interface ProjectSessionResources {
	resourceForLocalPath(path: string): ProjectSessionResource;
	parseLocalResource(uri: string): ProjectSessionResource | undefined;
}

/** Narrow Project-state operations coordinated by the Project session. */
export interface SessionProjectState {
	readonly snapshot: ProjectSnapshot;
	open(path: string): Promise<ProjectSelectionResult>;
	close(): Promise<void>;
}

/** Versioned stable identity retained independently of the Code OSS workspace. */
export interface ProjectSessionRecord {
	readonly version: 2;
	readonly projectId: string;
	readonly descriptorUri: string;
	readonly projectRootUri: string;
}

/** Persistence seam for the active Project across application restarts. */
export interface ProjectSessionRecordStore {
	read(): unknown;
	write(value: ProjectSessionRecord | undefined): Promise<void>;
}

/** Records successfully opened Projects for workspace-independent Welcome history. */
export interface ProjectRecentProjects {
	record(project: ProjectSummaryDto): Promise<void>;
}

/** Receives Project-session lifecycle messages. */
export interface ProjectSessionLogger {
	appendLine(message: string): void;
}

/** Native document close seam that must complete before Java Project invalidation. */
export interface ProjectDocumentLifecycle {
	closeProjectDocuments(): Promise<boolean>;
}

/** Local editor preparation performed before native authored-document resolution. */
export interface ProjectDocumentPreparation {
	prepareForDocumentClose(): Promise<boolean>;
}

/** Native Project viewport seam closed before its Java Project generation is invalidated. */
export interface ProjectViewportLifecycle {
	closeProjectViewports(): Promise<void>;
}

/** Starts presentation-only loading state for an explicit Project selection. */
export interface ProjectLoadingPresentationLifecycle {
	begin(location: ProjectLocation): ProjectLoadingSplashOperation;
}

/** Commits valid local editor state before delegating to VS Code's native dirty-document lifecycle. */
export class CoordinatedProjectDocumentLifecycle implements ProjectDocumentLifecycle {
	constructor(
		private readonly preparation: ProjectDocumentPreparation,
		private readonly documents: ProjectDocumentLifecycle
	) { }

	async closeProjectDocuments(): Promise<boolean> {
		return await this.preparation.prepareForDocumentClose()
			&& this.documents.closeProjectDocuments();
	}
}

/** Application-level result of one explicit Project selection. */
export type ProjectSessionOpenResult =
	| { readonly status: 'opened' | 'replaced' }
	| { readonly status: 'openRejected' | 'candidateRejected' | 'conflict' }
	| { readonly status: 'cancelled' };

/** Outcome of reopening the persisted active Project during activation. */
export type ProjectReopenOutcome =
	| { readonly status: 'none' }
	| { readonly status: 'reopened' }
	| { readonly status: 'failed'; readonly reason: string };

/** Owns one Java Project session independently of the Code OSS workspace lifecycle. */
export class ProjectSessionLifecycle {
	private operations: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(
		private readonly projectState: SessionProjectState,
		private readonly resources: ProjectSessionResources,
		private readonly recordStore: ProjectSessionRecordStore,
		private readonly logger: ProjectSessionLogger,
		private readonly documents: ProjectDocumentLifecycle = { closeProjectDocuments: () => Promise.resolve(true) },
		private readonly viewports: ProjectViewportLifecycle = { closeProjectViewports: () => Promise.resolve() },
		private readonly loadingPresentation: ProjectLoadingPresentationLifecycle = {
			begin: () => ({ complete: () => Promise.resolve() })
		},
		private readonly recentProjects: ProjectRecentProjects = { record: () => Promise.resolve() }
	) { }

	openProject(location: ProjectLocation): Promise<ProjectSessionOpenResult> {
		return this.runExclusive(async () => {
			if (this.projectState.snapshot.status === 'open') {
				if (!await this.documents.closeProjectDocuments()) {
					this.logger.appendLine('Project replacement cancelled while closing authored documents');
					return { status: 'cancelled' };
				}
				await this.viewports.closeProjectViewports();
			}

			const loading = this.loadingPresentation.begin(location);
			let loadingOutcome: 'success' | 'failure' = 'failure';
			try {
				const selection = await this.projectState.open(localProjectPath(location));
				const outcome = projectSelectionOutcome(selection);
				if (outcome.status !== 'opened' && outcome.status !== 'replaced') {
					if (selection.operation === 'open') {
						await this.recordStore.write(undefined);
					}
					return { status: outcome.status };
				}
				if (this.disposed) {
					return { status: outcome.status };
				}

				try {
					await this.recordStore.write(this.record(outcome.project));
				} catch (error) {
					this.logger.appendLine(`Project session persistence failed: ${errorMessage(error)}`);
					await this.projectState.close();
					throw error;
				}
				await this.recordRecentProject(outcome.project);
				this.logger.appendLine(`Project session ready: ${outcome.project.name}`);
				loadingOutcome = 'success';
				return { status: outcome.status };
			} finally {
				await loading.complete(loadingOutcome);
			}
		});
	}

	reopenPersistedProject(): Promise<ProjectReopenOutcome> {
		return this.runExclusive(async () => {
			const storedRecord = this.recordStore.read();
			if (storedRecord === undefined) {
				return { status: 'none' };
			}
			const record = parseProjectSessionRecord(storedRecord);
			if (record === undefined) {
				return this.failReopen('Persisted Project session record is invalid');
			}
			const descriptor = this.resources.parseLocalResource(record.descriptorUri);
			if (descriptor === undefined) {
				return this.failReopen('Persisted Project descriptor is not a local resource');
			}

			this.logger.appendLine(`Reopening JScene3D Project: ${descriptor.fsPath}`);
			const loading = this.loadingPresentation.begin({ scheme: 'file', fsPath: descriptor.fsPath });
			let loadingOutcome: 'success' | 'failure' = 'failure';
			try {
				const selection = await this.projectState.open(descriptor.fsPath);
				if (selection.operation !== 'open') {
					throw new Error('Persisted Project reopen unexpectedly attempted replacement');
				}
				const result = selection.result;
				if (!result.opened) {
					return this.failReopen(result.failureCode ?? 'Java Project validation failed');
				}
				if (record.projectId !== undefined && record.projectId !== result.project.id) {
					await this.projectState.close();
					return this.failReopen('Persisted Project identity no longer matches the descriptor');
				}
				await this.recordStore.write(this.record(result.project));
				await this.recordRecentProject(result.project);
				this.logger.appendLine(`Project reopened: ${result.project.name}`);
				loadingOutcome = 'success';
				return { status: 'reopened' };
			} catch (error) {
				await this.recordStore.write(undefined);
				const reason = errorMessage(error);
				this.logger.appendLine(`Project reopen failed: ${reason}`);
				return { status: 'failed', reason };
			} finally {
				await loading.complete(loadingOutcome);
			}
		});
	}

	closeProject(): Promise<void> {
		return this.runExclusive(async () => {
			if (this.projectState.snapshot.status !== 'open') {
				return;
			}
			if (!await this.documents.closeProjectDocuments()) {
				this.logger.appendLine('Project close cancelled while closing authored documents');
				return;
			}
			await this.viewports.closeProjectViewports();
			await this.projectState.close();
			await this.recordStore.write(undefined);
			this.logger.appendLine('Project session closed');
		});
	}

	dispose(): void {
		this.disposed = true;
	}

	private record(project: ProjectSummaryDto): ProjectSessionRecord {
		return {
			version: 2,
			projectId: project.id,
			descriptorUri: this.resources.resourceForLocalPath(project.descriptor).uri,
			projectRootUri: this.resources.resourceForLocalPath(project.root).uri
		};
	}

	private async failReopen(reason: string): Promise<ProjectReopenOutcome> {
		await this.recordStore.write(undefined);
		this.logger.appendLine(`Project reopen failed: ${reason}`);
		return { status: 'failed', reason };
	}

	private async recordRecentProject(project: ProjectSummaryDto): Promise<void> {
		try {
			await this.recentProjects.record(project);
		} catch (error) {
			this.logger.appendLine(`Recent Project history update failed: ${errorMessage(error)}`);
		}
	}

	private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operations.then(async () => {
			if (this.disposed) {
				throw new Error('Project session lifecycle has been disposed');
			}
			return operation();
		});
		this.operations = result.then(() => undefined, () => undefined);
		return result;
	}
}

interface ParsedProjectSessionRecord {
	readonly descriptorUri: string;
	readonly projectId?: string;
}

function parseProjectSessionRecord(value: unknown): ParsedProjectSessionRecord | undefined {
	if (!isRecord(value) || typeof value.descriptorUri !== 'string') {
		return undefined;
	}
	if (value.version === 1
		&& typeof value.projectRootUri === 'string'
		&& Object.keys(value).length === 3) {
		return { descriptorUri: value.descriptorUri };
	}
	if (value.version === 2
		&& typeof value.projectId === 'string'
		&& value.projectId.length > 0
		&& typeof value.projectRootUri === 'string'
		&& Object.keys(value).length === 4) {
		return { descriptorUri: value.descriptorUri, projectId: value.projectId };
	}
	return undefined;
}

type ProjectSelectionOutcome =
	| {
		readonly status: 'opened' | 'replaced';
		readonly project: ProjectSummaryDto;
	}
	| { readonly status: 'openRejected' | 'candidateRejected' | 'conflict' };

function projectSelectionOutcome(selection: ProjectSelectionResult): ProjectSelectionOutcome {
	if (selection.operation === 'open') {
		return selection.result.opened
			? { status: 'opened', project: selection.result.project }
			: { status: 'openRejected' };
	}
	switch (selection.result.outcome) {
		case 'replaced':
			return { status: 'replaced', project: selection.result.project };
		case 'candidateRejected':
			return { status: 'candidateRejected' };
		case 'conflict':
			return { status: 'conflict' };
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
