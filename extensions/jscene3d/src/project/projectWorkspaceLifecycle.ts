/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import { ProjectLocation, localProjectPath } from './projectLocation';
import { ProjectSelectionResult, ProjectSnapshot } from './projectState';

/** Stable local resource representation used at the workspace boundary. */
export interface ProjectWorkspaceResource {
	readonly uri: string;
	readonly fsPath: string;
}

/** Returns whether Code OSS is already a single-folder workspace for the Java root. */
export function isExactProjectWorkspace(
	projectRootUri: string,
	workspaceFileUri: string | undefined,
	workspaceFolderUris: readonly string[] | undefined
): boolean {
	return workspaceFileUri === undefined
		&& workspaceFolderUris?.length === 1
		&& workspaceFolderUris[0] === projectRootUri;
}

/** Public Code OSS workspace capabilities required by the project lifecycle. */
export interface ProjectWorkspaceHost {
	resourceForLocalPath(path: string): ProjectWorkspaceResource;
	parseLocalResource(uri: string): ProjectWorkspaceResource | undefined;
	matchesProjectRoot(root: ProjectWorkspaceResource): boolean;
	openProjectRoot(root: ProjectWorkspaceResource): Promise<void>;
	closeProjectWorkspace(): Promise<void>;
	onDidChangeWorkspace(listener: () => void): { dispose(): void };
}

/** Narrow project-state operations coordinated with workspace lifecycle. */
export interface WorkspaceProjectState {
	readonly snapshot: ProjectSnapshot;
	open(path: string): Promise<ProjectSelectionResult>;
	close(): Promise<void>;
}

/** Versioned active-project record retained across workspace transitions and editor restarts. */
export interface ProjectReopenIntent {
	readonly version: 1;
	readonly descriptorUri: string;
	readonly projectRootUri: string;
}

/** Persistence boundary for the active-project restart record. */
export interface ProjectReopenIntentStore {
	read(): unknown;
	write(value: ProjectReopenIntent | undefined): Promise<void>;
}

/** Receives workspace reconciliation messages. */
export interface ProjectWorkspaceLogger {
	appendLine(message: string): void;
}

/** Native document close boundary that must complete before Java project invalidation. */
export interface ProjectDocumentLifecycle {
	closeProjectDocuments(): Promise<boolean>;
}

/** Local editor preparation performed before native authored-document resolution. */
export interface ProjectDocumentPreparation {
	prepareForDocumentClose(): Promise<boolean>;
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

/** Application-level result of opening Java state and reconciling the Code OSS workspace. */
export type ProjectWorkspaceOpenResult =
	| {
		readonly status: 'opened' | 'replaced';
		readonly workspace: 'unchanged' | 'transitionRequested';
	}
	| {
		readonly status: 'openRejected' | 'candidateRejected' | 'conflict';
		readonly workspace: 'unchanged';
	}
	| { readonly status: 'cancelled'; readonly workspace: 'unchanged' };

/** Outcome of reopening a persisted active project during activation. */
export type ProjectReopenOutcome =
	| { readonly status: 'none' }
	| { readonly status: 'reopened' }
	| { readonly status: 'failed'; readonly reason: string };

/** Coordinates one Java authoring project with one Code OSS workspace. */
export class ProjectWorkspaceLifecycle {
	private readonly workspaceSubscription: { dispose(): void };
	private operations: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(
		private readonly projectState: WorkspaceProjectState,
		private readonly workspace: ProjectWorkspaceHost,
		private readonly intentStore: ProjectReopenIntentStore,
		private readonly logger: ProjectWorkspaceLogger,
		private readonly documents: ProjectDocumentLifecycle = { closeProjectDocuments: () => Promise.resolve(true) }
	) {
		this.workspaceSubscription = workspace.onDidChangeWorkspace(() => {
			void this.runExclusive(() => this.reconcileExternalWorkspaceChange()).catch(error => {
				this.logger.appendLine(`Workspace reconciliation failed: ${errorMessage(error)}`);
			});
		});
	}

	openProject(location: ProjectLocation): Promise<ProjectWorkspaceOpenResult> {
		return this.runExclusive(async () => {
			if (this.projectState.snapshot.status === 'open' && !await this.documents.closeProjectDocuments()) {
				this.logger.appendLine('Project replacement cancelled while closing authored documents');
				return { status: 'cancelled', workspace: 'unchanged' };
			}
			const selection = await this.projectState.open(localProjectPath(location));
			const outcome = projectSelectionOutcome(selection);
			if (outcome.status !== 'opened' && outcome.status !== 'replaced') {
				if (selection.operation === 'open') {
					await this.intentStore.write(undefined);
				}
				return { status: outcome.status, workspace: 'unchanged' };
			}
			if (this.disposed) {
				return { status: outcome.status, workspace: 'unchanged' };
			}

			const project = outcome.project;
			const projectRoot = this.workspace.resourceForLocalPath(project.root);
			const intent: ProjectReopenIntent = {
				version: 1,
				descriptorUri: this.workspace.resourceForLocalPath(project.descriptor).uri,
				projectRootUri: projectRoot.uri
			};
			if (this.workspace.matchesProjectRoot(projectRoot)) {
				await this.intentStore.write(intent);
				this.logger.appendLine(`Workspace already matches project root: ${project.root}`);
				return { status: outcome.status, workspace: 'unchanged' };
			}

			this.logger.appendLine('Persisting active project reopen record');
			try {
				await this.intentStore.write(intent);
			} catch (error) {
				this.logger.appendLine(`Project reopen intent persistence failed: ${errorMessage(error)}`);
				await this.projectState.close();
				throw error;
			}
			const action = outcome.status === 'replaced' ? 'Opening replacement workspace' : 'Opening project workspace';
			this.logger.appendLine(`${action}: ${project.root}`);
			try {
				await this.workspace.openProjectRoot(projectRoot);
			} catch (error) {
				if (this.disposed) {
					return { status: outcome.status, workspace: 'transitionRequested' };
				}
				this.logger.appendLine(`Project workspace open failed: ${errorMessage(error)}`);
				await Promise.all([
					this.intentStore.write(undefined),
					this.projectState.close()
				]);
				throw error;
			}
			return { status: outcome.status, workspace: 'transitionRequested' };
		});
	}

	reopenPendingProject(): Promise<ProjectReopenOutcome> {
		return this.runExclusive(async () => {
			const storedIntent = this.intentStore.read();
			if (storedIntent === undefined) {
				return { status: 'none' };
			}
			const intent = projectReopenIntent(storedIntent);
			if (intent === undefined) {
				const reason = 'Pending project reopen intent is invalid';
				await this.intentStore.write(undefined);
				this.logger.appendLine(`Project reopen failed: ${reason}`);
				return { status: 'failed', reason };
			}
			const descriptor = this.workspace.parseLocalResource(intent.descriptorUri);
			const intendedRoot = this.workspace.parseLocalResource(intent.projectRootUri);
			if (descriptor === undefined || intendedRoot === undefined || !this.workspace.matchesProjectRoot(intendedRoot)) {
				const reason = 'Pending project intent does not match the current local workspace';
				await this.intentStore.write(undefined);
				this.logger.appendLine(`Project reopen failed: ${reason}`);
				return { status: 'failed', reason };
			}

			this.logger.appendLine(`Reopening JScene3D project after workspace activation: ${descriptor.fsPath}`);
			try {
				const selection = await this.projectState.open(descriptor.fsPath);
				if (selection.operation !== 'open') {
					throw new Error('Pending project reopen unexpectedly attempted replacement');
				}
				const result = selection.result;
				if (!result.opened) {
					await this.intentStore.write(undefined);
					this.logger.appendLine(`Project reopen failed: ${result.failureCode ?? 'Java project validation failed'}`);
					return { status: 'failed', reason: result.failureCode ?? 'Java project validation failed' };
				}
				const actualRoot = this.workspace.resourceForLocalPath(result.project.root);
				if (!this.workspace.matchesProjectRoot(actualRoot)) {
					await this.intentStore.write(undefined);
					await this.projectState.close();
					this.logger.appendLine('Project reopen failed: Java project root does not match the current workspace');
					return { status: 'failed', reason: 'Java project root does not match the current workspace' };
				}
				this.logger.appendLine(`Project reopened: ${result.project.name}`);
				return { status: 'reopened' };
			} catch (error) {
				await this.intentStore.write(undefined);
				const reason = errorMessage(error);
				this.logger.appendLine(`Project reopen failed: ${reason}`);
				return { status: 'failed', reason };
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
			await this.projectState.close();
			await this.intentStore.write(undefined);
			this.logger.appendLine('Closing project workspace');
			try {
				await this.workspace.closeProjectWorkspace();
			} catch (error) {
				this.logger.appendLine(`Project workspace close failed: ${errorMessage(error)}`);
				throw error;
			}
		});
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.workspaceSubscription.dispose();
	}

	private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operations.then(async () => {
			if (this.disposed) {
				throw new Error('Project workspace lifecycle has been disposed');
			}
			return operation();
		});
		this.operations = result.then(() => undefined, () => undefined);
		return result;
	}

	private async reconcileExternalWorkspaceChange(): Promise<void> {
		const snapshot = this.projectState.snapshot;
		if (snapshot.status !== 'open') {
			return;
		}
		const projectRoot = this.workspace.resourceForLocalPath(snapshot.project.root);
		if (this.workspace.matchesProjectRoot(projectRoot)) {
			return;
		}
		this.logger.appendLine(`Workspace no longer matches open project; closing Java project: ${snapshot.project.name}`);
		await Promise.all([
			this.intentStore.write(undefined),
			this.projectState.close()
		]);
	}
}

function projectReopenIntent(value: unknown): ProjectReopenIntent | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const keys = Object.keys(value).sort();
	if (keys.length !== 3
		|| keys[0] !== 'descriptorUri'
		|| keys[1] !== 'projectRootUri'
		|| keys[2] !== 'version'
		|| value.version !== 1
		|| typeof value.descriptorUri !== 'string'
		|| typeof value.projectRootUri !== 'string') {
		return undefined;
	}
	return {
		version: 1,
		descriptorUri: value.descriptorUri,
		projectRootUri: value.projectRootUri
	};
}

type ProjectSelectionOutcome =
	| { readonly status: 'opened' | 'replaced'; readonly project: ProjectSummaryDto }
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
