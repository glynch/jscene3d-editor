/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	ProjectCloseResultDto,
	ProjectDiagnosticDto,
	ProjectOpenResultDto,
	ProjectReplaceResultDto,
	ProjectSummaryDto
} from '../protocol/authoringProtocol';

/** Project lifecycle operations consumed by the editor-side state cache. */
export interface ProjectAuthoringClient {
	openProject(path: string): Promise<ProjectOpenResultDto>;
	replaceProject(expectedProjectGeneration: number, path: string): Promise<ProjectReplaceResultDto>;
	closeProject(): Promise<ProjectCloseResultDto>;
	onDidFail(listener: (error: Error) => void): { dispose(): void };
}

/** Receives project lifecycle messages without depending on VS Code APIs. */
export interface ProjectStateLogger {
	appendLine(message: string): void;
}

interface ProjectDiagnosticScopes {
	readonly activeDiagnostics: readonly ProjectDiagnosticDto[];
	readonly attemptDiagnostics: readonly ProjectDiagnosticDto[];
}

type EmptyProjectSnapshot = ProjectDiagnosticScopes & (
	| { readonly status: 'closed' }
	| { readonly status: 'opening'; readonly candidatePath: string }
	| { readonly status: 'cancellingOpen'; readonly candidatePath: string }
);

interface OpenProjectSnapshot extends ProjectDiagnosticScopes {
	readonly status: 'open' | 'closing';
	readonly generation: number;
	readonly project: ProjectSummaryDto;
}

interface ReplacingProjectSnapshot extends ProjectDiagnosticScopes {
	readonly status: 'replacing';
	readonly generation: number;
	readonly project: ProjectSummaryDto;
	readonly candidatePath: string;
}

interface OpenFailedProjectSnapshot extends ProjectDiagnosticScopes {
	readonly status: 'openFailed';
	readonly failure: string;
}

interface ServiceUnavailableProjectSnapshot extends ProjectDiagnosticScopes {
	readonly status: 'serviceUnavailable';
	readonly failure: string;
}

/** Immutable editor-side projection of the current Java project-session lifecycle. */
export type ProjectSnapshot = EmptyProjectSnapshot | OpenProjectSnapshot | ReplacingProjectSnapshot
	| OpenFailedProjectSnapshot | ServiceUnavailableProjectSnapshot;

/** Identifies which Java operation handled an explicit project selection. */
export type ProjectSelectionResult =
	| { readonly operation: 'open'; readonly result: ProjectOpenResultDto }
	| { readonly operation: 'replace'; readonly result: ProjectReplaceResultDto };

/** Owns the one editor-side cache of the retained Java project session. */
export class ProjectState implements Disposable {
	private readonly listeners = new Set<() => void>();
	private readonly serviceFailureSubscription: { dispose(): void };
	private snapshotValue: ProjectSnapshot = closedSnapshot();
	private pendingSelection: Promise<ProjectSelectionResult> | undefined;
	private pendingClose: Promise<void> | undefined;
	private disposed = false;

	constructor(private readonly client: ProjectAuthoringClient, private readonly logger: ProjectStateLogger) {
		this.serviceFailureSubscription = client.onDidFail(error => {
			if (this.disposed) {
				return;
			}
			this.snapshotValue = serviceUnavailableSnapshot(error.message);
			this.emit();
		});
	}

	get snapshot(): ProjectSnapshot {
		return this.snapshotValue;
	}

	onDidChange(listener: () => void): Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	async open(path: string): Promise<ProjectSelectionResult> {
		if (this.disposed) {
			throw new Error('JScene3D project state has been disposed');
		}
		if (this.snapshotValue.status === 'open') {
			return this.startReplacement(this.snapshotValue, path);
		}
		if (!canOpen(this.snapshotValue)) {
			throw new Error('A JScene3D project is already changing state');
		}

		this.snapshotValue = openingSnapshot(path);
		this.logger.appendLine(`Opening project: ${path}`);
		return this.trackSelection(this.performOpen(path));
	}

	async close(): Promise<void> {
		if (this.disposed) {
			return;
		}

		switch (this.snapshotValue.status) {
			case 'opening': {
				this.snapshotValue = cancellingOpenSnapshot(this.snapshotValue.candidatePath);
				const pending = this.pendingSelection;
				if (pending === undefined) {
					throw new Error('Project open reconciliation is unavailable');
				}
				return this.trackClose(pending.then(() => undefined));
			}
			case 'replacing': {
				throw new Error('A JScene3D project replacement is already in progress');
			}
			case 'cancellingOpen':
			case 'closing': {
				const pending = this.pendingClose;
				if (pending === undefined) {
					throw new Error('Project close reconciliation is unavailable');
				}
				return pending;
			}
			case 'open': {
				const project = this.snapshotValue;
				this.logger.appendLine(`Closing project: ${project.project.name}`);
				this.snapshotValue = { ...project, status: 'closing' };
				this.emit();
				return this.trackClose(this.performClose(project));
			}
			case 'closed':
			case 'openFailed':
			case 'serviceUnavailable':
				return;
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.serviceFailureSubscription.dispose();
		this.listeners.clear();
		this.snapshotValue = closedSnapshot();
	}

	private startReplacement(current: OpenProjectSnapshot, path: string): Promise<ProjectSelectionResult> {
		this.snapshotValue = { ...current, status: 'replacing', candidatePath: path, attemptDiagnostics: [] };
		this.logger.appendLine(`Replacing project: ${current.project.name} → ${path}`);
		const pending = this.performReplacement(current, path);
		this.emit();
		return this.trackSelection(pending);
	}

	private async trackSelection(pending: Promise<ProjectSelectionResult>): Promise<ProjectSelectionResult> {
		this.pendingSelection = pending;
		this.emit();
		try {
			return await pending;
		} finally {
			if (this.pendingSelection === pending) {
				this.pendingSelection = undefined;
			}
		}
	}

	private async trackClose(closing: Promise<void>): Promise<void> {
		this.pendingClose = closing;
		this.emit();
		try {
			await closing;
		} finally {
			if (this.pendingClose === closing) {
				this.pendingClose = undefined;
			}
		}
	}

	private async performOpen(path: string): Promise<ProjectSelectionResult> {
		let result: ProjectOpenResultDto;
		try {
			result = await this.client.openProject(path);
		} catch (error) {
			this.acceptOperationFailure('Project open failed', error);
			throw error;
		}

		if (this.disposed) {
			return { operation: 'open', result };
		}
			if (this.snapshotValue.status === 'cancellingOpen') {
				if (result.opened) {
					try {
						await this.closeJavaSession(result.projectGeneration);
				} catch (error) {
					this.acceptAuthorityFailure(error);
					throw error;
				}
			}
			if (!this.disposed && this.snapshotValue.status === 'cancellingOpen') {
				this.snapshotValue = closedSnapshot();
				this.emit();
			}
			return { operation: 'open', result };
		}
		if (this.snapshotValue.status !== 'opening') {
			return { operation: 'open', result };
		}

		if (result.opened) {
			this.snapshotValue = openSnapshot(result.projectGeneration, result.project, result.diagnostics);
			this.logger.appendLine(`Project opened: ${result.project.name}`);
		} else {
			this.snapshotValue = {
				status: 'openFailed',
				activeDiagnostics: [],
				attemptDiagnostics: result.diagnostics,
				failure: result.failureCode ?? 'Project validation failed'
			};
			this.logger.appendLine(`Project open failed: ${result.failureCode ?? 'Java project validation failed'}`);
		}
		this.emit();
		return { operation: 'open', result };
	}

	private async performReplacement(current: OpenProjectSnapshot, path: string): Promise<ProjectSelectionResult> {
		let result: ProjectReplaceResultDto;
		try {
			result = await this.client.replaceProject(current.generation, path);
		} catch (error) {
			this.acceptOperationFailure('Project replacement failed', error);
			throw error;
		}

		if (this.disposed || this.snapshotValue.status !== 'replacing') {
			return { operation: 'replace', result };
		}
		switch (result.outcome) {
			case 'replaced':
				this.snapshotValue = openSnapshot(result.projectGeneration, result.project, result.diagnostics);
				this.logger.appendLine(`Project replaced: ${result.project.name}`);
				break;
			case 'candidateRejected':
				this.snapshotValue = { ...current, status: 'open', attemptDiagnostics: result.diagnostics };
				this.logger.appendLine('Project replacement rejected: Java project validation failed');
				break;
			case 'conflict':
				this.snapshotValue = serviceUnavailableSnapshot(result.failureCode, result.diagnostics);
				this.logger.appendLine(`Project replacement conflict: ${result.failureCode}`);
				break;
		}
		this.emit();
		return { operation: 'replace', result };
	}

	private async performClose(project: OpenProjectSnapshot): Promise<void> {
		try {
			await this.closeJavaSession(project.generation);
		} catch (error) {
			if (error instanceof ProjectAuthorityError) {
				this.acceptAuthorityFailure(error);
			} else if (!this.disposed && this.snapshotValue.status === 'closing') {
				this.snapshotValue = project;
				this.logger.appendLine(`Project close failed: ${errorMessage(error)}`);
				this.emit();
			}
			throw error;
		}
		if (!this.disposed && this.snapshotValue.status === 'closing') {
			this.snapshotValue = closedSnapshot();
			this.logger.appendLine(`Project closed: ${project.project.name}`);
			this.emit();
		}
	}

	private async closeJavaSession(expectedGeneration: number): Promise<void> {
		const result = await this.client.closeProject();
		if (!result.closed) {
			throw new ProjectAuthorityError('Java did not close the active project session');
		}
		if (result.invalidatedProjectGeneration !== expectedGeneration) {
			throw new ProjectAuthorityError(
				`Java closed project generation ${result.invalidatedProjectGeneration}; expected ${expectedGeneration}`
			);
		}
	}

	private acceptOperationFailure(prefix: string, error: unknown): void {
		if (this.disposed || this.snapshotValue.status === 'serviceUnavailable') {
			return;
		}
		const failure = errorMessage(error);
		this.snapshotValue = serviceUnavailableSnapshot(failure);
		this.logger.appendLine(`${prefix}: ${failure}`);
		this.emit();
	}

	private acceptAuthorityFailure(error: unknown): void {
		if (this.disposed || this.snapshotValue.status === 'serviceUnavailable') {
			return;
		}
		this.snapshotValue = serviceUnavailableSnapshot(errorMessage(error));
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

class ProjectAuthorityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectAuthorityError';
	}
}

function canOpen(snapshot: ProjectSnapshot): boolean {
	return snapshot.status === 'closed' || snapshot.status === 'openFailed' || snapshot.status === 'serviceUnavailable';
}

function emptySnapshot(status: 'closed'): EmptyProjectSnapshot {
	return { status, activeDiagnostics: [], attemptDiagnostics: [] };
}

function openingSnapshot(candidatePath: string): EmptyProjectSnapshot {
	return { status: 'opening', candidatePath, activeDiagnostics: [], attemptDiagnostics: [] };
}

function cancellingOpenSnapshot(candidatePath: string): EmptyProjectSnapshot {
	return { status: 'cancellingOpen', candidatePath, activeDiagnostics: [], attemptDiagnostics: [] };
}

function closedSnapshot(): EmptyProjectSnapshot {
	return emptySnapshot('closed');
}

function openSnapshot(
	generation: number,
	project: ProjectSummaryDto,
	diagnostics: readonly ProjectDiagnosticDto[]
): OpenProjectSnapshot {
	return {
		status: 'open',
		generation,
		project,
		activeDiagnostics: diagnostics,
		attemptDiagnostics: []
	};
}

function serviceUnavailableSnapshot(
	failure: string,
	attemptDiagnostics: readonly ProjectDiagnosticDto[] = []
): ServiceUnavailableProjectSnapshot {
	return { status: 'serviceUnavailable', activeDiagnostics: [], attemptDiagnostics, failure };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Minimal disposable contract used by the VS Code-independent state model. */
interface Disposable {
	dispose(): void;
}
