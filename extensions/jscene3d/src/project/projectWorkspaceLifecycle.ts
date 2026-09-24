/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectOpenResultDto } from '../protocol/authoringProtocol';
import { ProjectLocation, localProjectPath } from './projectLocation';
import { ProjectSnapshot } from './projectState';

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
	onDidChangeWorkspace(listener: () => void): { dispose(): void };
}

/** Narrow project-state operations coordinated with workspace lifecycle. */
export interface WorkspaceProjectState {
	readonly snapshot: ProjectSnapshot;
	open(path: string): Promise<ProjectOpenResultDto>;
	close(): Promise<void>;
}

/** Versioned stable intent retained only across a workspace transition. */
export interface ProjectReopenIntent {
	readonly version: 1;
	readonly descriptorUri: string;
	readonly projectRootUri: string;
}

/** Persistence boundary for the one pending workspace-transition intent. */
export interface ProjectReopenIntentStore {
	read(): unknown;
	write(value: ProjectReopenIntent | undefined): Promise<void>;
}

/** Receives workspace reconciliation messages. */
export interface ProjectWorkspaceLogger {
	appendLine(message: string): void;
}

/** Result of opening Java state and reconciling the Code OSS workspace. */
export interface ProjectWorkspaceOpenResult {
	readonly project: ProjectOpenResultDto;
	readonly workspace: 'unchanged' | 'transitionRequested';
}

/** Outcome of reconciling a persisted project intent during activation. */
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
		private readonly logger: ProjectWorkspaceLogger
	) {
		this.workspaceSubscription = workspace.onDidChangeWorkspace(() => {
			void this.runExclusive(() => this.reconcileExternalWorkspaceChange()).catch(error => {
				this.logger.appendLine(`Workspace reconciliation failed: ${errorMessage(error)}`);
			});
		});
	}

	openProject(location: ProjectLocation): Promise<ProjectWorkspaceOpenResult> {
		return this.runExclusive(async () => {
			const result = await this.projectState.open(localProjectPath(location));
			if (!result.opened || result.project === null) {
				await this.intentStore.write(undefined);
				return { project: result, workspace: 'unchanged' };
			}
			if (this.disposed) {
				return { project: result, workspace: 'unchanged' };
			}

			const projectRoot = this.workspace.resourceForLocalPath(result.project.root);
			if (this.workspace.matchesProjectRoot(projectRoot)) {
				await this.intentStore.write(undefined);
				this.logger.appendLine(`Workspace already matches project root: ${result.project.root}`);
				return { project: result, workspace: 'unchanged' };
			}

			const intent: ProjectReopenIntent = {
				version: 1,
				descriptorUri: this.workspace.resourceForLocalPath(result.project.descriptor).uri,
				projectRootUri: projectRoot.uri
			};
			this.logger.appendLine('Persisting project reopen intent');
			try {
				await this.intentStore.write(intent);
			} catch (error) {
				this.logger.appendLine(`Project reopen intent persistence failed: ${errorMessage(error)}`);
				await this.projectState.close();
				throw error;
			}
			this.logger.appendLine(`Opening project workspace: ${result.project.root}`);
			try {
				await this.workspace.openProjectRoot(projectRoot);
			} catch (error) {
				if (this.disposed) {
					return { project: result, workspace: 'transitionRequested' };
				}
				this.logger.appendLine(`Project workspace open failed: ${errorMessage(error)}`);
				await Promise.all([
					this.intentStore.write(undefined),
					this.projectState.close()
				]);
				throw error;
			}
			return { project: result, workspace: 'transitionRequested' };
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
				const result = await this.projectState.open(descriptor.fsPath);
				if (!result.opened || result.project === null || result.projectGeneration === null) {
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
				await this.intentStore.write(undefined);
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
			await Promise.all([
				this.intentStore.write(undefined),
				this.projectState.close()
			]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
