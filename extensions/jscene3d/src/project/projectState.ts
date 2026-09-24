/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectDiagnosticDto, ProjectOpenResultDto, ProjectSummaryDto } from '../protocol/authoringProtocol';

/** Project lifecycle operations consumed by the editor-side state cache. */
export interface ProjectAuthoringClient {
	openProject(path: string): Promise<ProjectOpenResultDto>;
	closeProject(): Promise<{ readonly closed: boolean; readonly invalidatedProjectGeneration: number | null }>;
	onDidFail(listener: (error: Error) => void): { dispose(): void };
}

/** Receives project lifecycle messages without depending on VS Code APIs. */
export interface ProjectStateLogger {
	appendLine(message: string): void;
}

export type ProjectStatus = 'closed' | 'opening' | 'open' | 'closing' | 'failed';

/** Immutable editor-side projection of the current Java project session. */
export interface ProjectSnapshot {
	readonly status: ProjectStatus;
	readonly generation: number | null;
	readonly project: ProjectSummaryDto | null;
	readonly diagnostics: readonly ProjectDiagnosticDto[];
	readonly failure: string | null;
}

/** Owns the one editor-side cache of the retained Java project session. */
export class ProjectState implements Disposable {
	private readonly listeners = new Set<() => void>();
	private readonly serviceFailureSubscription: { dispose(): void };
	private snapshotValue: ProjectSnapshot = closedSnapshot();
	private operation = 0;

	constructor(private readonly client: ProjectAuthoringClient, private readonly logger: ProjectStateLogger) {
		this.serviceFailureSubscription = client.onDidFail(error => {
			this.operation++;
			this.snapshotValue = {
				status: 'failed',
				generation: null,
				project: null,
				diagnostics: [],
				failure: error.message
			};
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
		if (this.snapshotValue.status === 'open' || this.snapshotValue.status === 'opening' || this.snapshotValue.status === 'closing') {
			throw new Error('A JScene3D project is already open or changing state');
		}
		const operation = ++this.operation;
		this.snapshotValue = {
			status: 'opening',
			generation: null,
			project: null,
			diagnostics: [],
			failure: null
		};
		this.emit();
		this.logger.appendLine(`Opening project: ${path}`);

		try {
			const result = await this.client.openProject(path);
			if (operation !== this.operation) {
				if (result.opened) {
					await this.client.closeProject();
				}
				return result;
			}
			if (result.opened) {
				this.snapshotValue = {
					status: 'open',
					generation: result.projectGeneration,
					project: result.project,
					diagnostics: result.diagnostics,
					failure: null
				};
				this.logger.appendLine(`Project opened: ${result.project?.name ?? path}`);
			} else {
				this.snapshotValue = {
					status: 'failed',
					generation: null,
					project: null,
					diagnostics: result.diagnostics,
					failure: result.failureCode ?? 'Project validation failed'
				};
				this.logger.appendLine(`Project open failed: ${result.failureCode ?? 'Java project validation failed'}`);
			}
			this.emit();
			return result;
		} catch (error) {
			if (operation === this.operation) {
				const failure = error instanceof Error ? error.message : String(error);
				this.snapshotValue = {
					status: 'failed',
					generation: null,
					project: null,
					diagnostics: [],
					failure
				};
				this.logger.appendLine(`Project open failed: ${failure}`);
				this.emit();
			}
			throw error;
		}
	}

	async close(): Promise<void> {
		const previous = this.snapshotValue;
		const operation = ++this.operation;
		if (previous.status !== 'open') {
			this.snapshotValue = closedSnapshot();
			this.emit();
			return;
		}
		this.snapshotValue = { ...previous, status: 'closing' };
		this.emit();
		try {
			await this.client.closeProject();
			if (operation === this.operation) {
				this.snapshotValue = closedSnapshot();
				this.logger.appendLine(`Project closed: ${previous.project?.name ?? 'JScene3D project'}`);
				this.emit();
			}
		} catch (error) {
			if (operation === this.operation) {
				const failure = error instanceof Error ? error.message : String(error);
				this.snapshotValue = { ...closedSnapshot(), status: 'failed', failure };
				this.logger.appendLine(`Project close failed: ${failure}`);
				this.emit();
			}
			throw error;
		}
	}

	dispose(): void {
		this.operation++;
		this.serviceFailureSubscription.dispose();
		this.listeners.clear();
		this.snapshotValue = closedSnapshot();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

/** Creates the canonical empty project snapshot. */
function closedSnapshot(): ProjectSnapshot {
	return {
		status: 'closed',
		generation: null,
		project: null,
		diagnostics: [],
		failure: null
	};
}

/** Minimal disposable contract used by the VS Code-independent state model. */
interface Disposable {
	dispose(): void;
}
