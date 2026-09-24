/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectCloseResultDto, ProjectDiagnosticDto, ProjectOpenResultDto, ProjectSummaryDto } from '../protocol/authoringProtocol';

/** Project lifecycle operations consumed by the editor-side state cache. */
export interface ProjectAuthoringClient {
	openProject(path: string): Promise<ProjectOpenResultDto>;
	closeProject(): Promise<ProjectCloseResultDto>;
	onDidFail(listener: (error: Error) => void): { dispose(): void };
}

/** Receives project lifecycle messages without depending on VS Code APIs. */
export interface ProjectStateLogger {
	appendLine(message: string): void;
}

type EmptyProjectSnapshot =
	| { readonly status: 'closed'; readonly diagnostics: readonly ProjectDiagnosticDto[] }
	| { readonly status: 'opening'; readonly diagnostics: readonly ProjectDiagnosticDto[] }
	| { readonly status: 'cancellingOpen'; readonly diagnostics: readonly ProjectDiagnosticDto[] };

interface OpenProjectSnapshot {
	readonly status: 'open' | 'closing';
	readonly generation: number;
	readonly project: ProjectSummaryDto;
	readonly diagnostics: readonly ProjectDiagnosticDto[];
}

interface OpenFailedProjectSnapshot {
	readonly status: 'openFailed';
	readonly diagnostics: readonly ProjectDiagnosticDto[];
	readonly failure: string;
}

interface ServiceUnavailableProjectSnapshot {
	readonly status: 'serviceUnavailable';
	readonly diagnostics: readonly ProjectDiagnosticDto[];
	readonly failure: string;
}

/** Immutable editor-side projection of the current Java project-session lifecycle. */
export type ProjectSnapshot = EmptyProjectSnapshot | OpenProjectSnapshot | OpenFailedProjectSnapshot | ServiceUnavailableProjectSnapshot;

/** Owns the one editor-side cache of the retained Java project session. */
export class ProjectState implements Disposable {
	private readonly listeners = new Set<() => void>();
	private readonly serviceFailureSubscription: { dispose(): void };
	private snapshotValue: ProjectSnapshot = closedSnapshot();
	private pendingOpen: Promise<ProjectOpenResultDto> | undefined;
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

	async open(path: string): Promise<ProjectOpenResultDto> {
		if (this.disposed) {
			throw new Error('JScene3D project state has been disposed');
		}
		if (!canOpen(this.snapshotValue)) {
			throw new Error('A JScene3D project is already open or changing state');
		}

		this.snapshotValue = emptySnapshot('opening');
		this.logger.appendLine(`Opening project: ${path}`);
		const pending = this.performOpen(path);
		this.pendingOpen = pending;
		this.emit();
		try {
			return await pending;
		} finally {
			if (this.pendingOpen === pending) {
				this.pendingOpen = undefined;
			}
		}
	}

	async close(): Promise<void> {
		if (this.disposed) {
			return;
		}

		switch (this.snapshotValue.status) {
			case 'opening': {
				this.snapshotValue = emptySnapshot('cancellingOpen');
				const pending = this.pendingOpen;
				if (pending === undefined) {
					throw new Error('Project open reconciliation is unavailable');
				}
				const closing = pending.then(() => undefined);
				this.pendingClose = closing;
				this.emit();
				try {
					await closing;
				} finally {
					if (this.pendingClose === closing) {
						this.pendingClose = undefined;
					}
				}
				return;
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
				this.snapshotValue = { ...project, status: 'closing' };
				const closing = this.performClose(project);
				this.pendingClose = closing;
				this.emit();
				try {
					await closing;
				} finally {
					if (this.pendingClose === closing) {
						this.pendingClose = undefined;
					}
				}
				return;
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

	private async performOpen(path: string): Promise<ProjectOpenResultDto> {
		let result: ProjectOpenResultDto;
		try {
			result = await this.client.openProject(path);
		} catch (error) {
			this.acceptOpenFailure(error);
			throw error;
		}

		if (this.disposed) {
			return result;
		}
		if (this.snapshotValue.status === 'cancellingOpen') {
			if (result.opened) {
				try {
					await this.closeJavaSession(requiredGeneration(result));
				} catch (error) {
					this.acceptAuthorityFailure(error);
					throw error;
				}
			}
			if (!this.disposed && this.snapshotValue.status === 'cancellingOpen') {
				this.snapshotValue = closedSnapshot();
				this.emit();
			}
			return result;
		}
		if (this.snapshotValue.status !== 'opening') {
			return result;
		}

		if (result.opened) {
			const project = requiredProject(result);
			this.snapshotValue = {
				status: 'open',
				generation: requiredGeneration(result),
				project,
				diagnostics: result.diagnostics
			};
			this.logger.appendLine(`Project opened: ${project.name}`);
		} else {
			this.snapshotValue = {
				status: 'openFailed',
				diagnostics: result.diagnostics,
				failure: result.failureCode ?? 'Project validation failed'
			};
			this.logger.appendLine(`Project open failed: ${result.failureCode ?? 'Java project validation failed'}`);
		}
		this.emit();
		return result;
	}

	private async performClose(project: OpenProjectSnapshot): Promise<void> {
		try {
			await this.closeJavaSession(project.generation);
		} catch (error) {
			if (error instanceof ProjectAuthorityError) {
				this.acceptAuthorityFailure(error);
			} else if (!this.disposed && this.snapshotValue.status === 'closing') {
				this.snapshotValue = { ...project, status: 'open' };
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
		if (!result.closed || result.invalidatedProjectGeneration !== expectedGeneration) {
			throw new ProjectAuthorityError(
				`Java closed project generation ${result.invalidatedProjectGeneration ?? 'none'}; expected ${expectedGeneration}`
			);
		}
	}

	private acceptOpenFailure(error: unknown): void {
		if (this.disposed || this.snapshotValue.status === 'serviceUnavailable') {
			return;
		}
		const failure = errorMessage(error);
		this.snapshotValue = serviceUnavailableSnapshot(failure);
		this.logger.appendLine(`Project open failed: ${failure}`);
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

function emptySnapshot(status: EmptyProjectSnapshot['status']): EmptyProjectSnapshot {
	return { status, diagnostics: [] };
}

function closedSnapshot(): EmptyProjectSnapshot {
	return emptySnapshot('closed');
}

function serviceUnavailableSnapshot(failure: string): ServiceUnavailableProjectSnapshot {
	return { status: 'serviceUnavailable', diagnostics: [], failure };
}

function requiredProject(result: ProjectOpenResultDto): ProjectSummaryDto {
	if (result.project === null) {
		throw new Error('Opened project result is missing its project summary');
	}
	return result.project;
}

function requiredGeneration(result: ProjectOpenResultDto): number {
	if (result.projectGeneration === null) {
		throw new Error('Opened project result is missing its project generation');
	}
	return result.projectGeneration;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Minimal disposable contract used by the VS Code-independent state model. */
interface Disposable {
	dispose(): void;
}
