/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLocation, localProjectPath } from './projectLocation';

/** Minimum time that an opened Project identity remains readable before it is revealed. */
export const projectLoadingSplashMinimumVisibleMs = 2_000;

/** Duration of the normal transition from Project identity to the ready presentation. */
export const projectLoadingSplashFadeDurationMs = 200;

/** Presentation-only metadata read from the selected Project descriptor. */
export interface ProjectLoadingMetadata {
	readonly name: string;
	readonly version?: string;
	readonly description?: string;
	readonly authors: readonly string[];
	readonly iconUri?: string;
}

/** Reads non-authoritative Project identity metadata without performing Project validation. */
export interface ProjectLoadingMetadataSource {
	read(location: ProjectLocation): Promise<ProjectLoadingMetadata>;
}

/** Workbench operations required by the Project-loading presentation. */
export interface ProjectLoadingSplashHost {
	show(operationId: number, metadata: ProjectLoadingMetadata): Promise<void>;
	hide(operationId: number, fadeDurationMs: number): Promise<void>;
}

/** Fakeable clock and delayed-execution seam used by Project-loading presentation tests. */
export interface ProjectLoadingSplashScheduler {
	now(): number;
	schedule(callback: () => void, delayMs: number): { dispose(): void };
}

/** Terminal outcome used to choose a normal reveal or prompt failure dismissal. */
export type ProjectLoadingSplashOutcome = 'success' | 'failure';

/** One Project-loading operation coordinated with terminal Project presentation. */
export interface ProjectLoadingSplashOperation {
	complete(outcome: ProjectLoadingSplashOutcome): Promise<void>;
}

interface ActiveProjectLoadingSplash {
	readonly id: number;
	readonly location: ProjectLocation;
	minimumVisibleTimer: { dispose(): void };
	displayed: boolean;
	showing: boolean;
	shownAt: number | undefined;
	minimumVisibleElapsed: boolean;
	completion: ProjectLoadingSplashOutcome | undefined;
	projectPresentationReady: boolean;
}

/** Owns immediate, minimum-duration, stale-safe Project-loading presentation. */
export class ProjectLoadingSplashLifecycle {
	private activeOperation: ActiveProjectLoadingSplash | undefined;
	private nextOperationId = 0;
	private disposed = false;

	constructor(
		private readonly metadataSource: ProjectLoadingMetadataSource,
		private readonly host: ProjectLoadingSplashHost,
		private readonly scheduler: ProjectLoadingSplashScheduler,
		private readonly logger: { appendLine(message: string): void },
		private readonly minimumVisibleMs = projectLoadingSplashMinimumVisibleMs,
		private readonly fadeDurationMs = projectLoadingSplashFadeDurationMs
	) { }

	get active(): boolean {
		return this.activeOperation !== undefined;
	}

	begin(location: ProjectLocation): ProjectLoadingSplashOperation {
		if (this.disposed) {
			return completedOperation;
		}
		const previous = this.activeOperation;
		if (previous !== undefined) {
			void this.dismiss(previous, 0);
		}
		const operation: ActiveProjectLoadingSplash = {
			id: ++this.nextOperationId,
			location,
			minimumVisibleTimer: { dispose: () => { } },
			displayed: false,
			showing: false,
			shownAt: undefined,
			minimumVisibleElapsed: false,
			completion: undefined,
			projectPresentationReady: false
		};
		this.activeOperation = operation;
		void this.show(operation);
		return {
			complete: outcome => this.complete(operation, outcome)
		};
	}

	async acceptProjectPresentationReady(): Promise<void> {
		const operation = this.activeOperation;
		if (operation === undefined) {
			return;
		}
		operation.projectPresentationReady = true;
		await this.dismissIfEligible(operation);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		const operation = this.activeOperation;
		this.activeOperation = undefined;
		operation?.minimumVisibleTimer.dispose();
		if (operation?.displayed) {
			void this.host.hide(operation.id, 0).catch(error => this.logFailure('hide', error));
		}
	}

	private async show(operation: ActiveProjectLoadingSplash): Promise<void> {
		if (!this.isCurrent(operation)) {
			return;
		}
		operation.showing = true;
		let metadata: ProjectLoadingMetadata;
		try {
			metadata = await this.metadataSource.read(operation.location);
		} catch (error) {
			this.logFailure('read Project metadata for', error);
			metadata = fallbackMetadata(operation.location);
		}
		if (!this.isCurrent(operation)) {
			return;
		}
		try {
			await this.host.show(operation.id, metadata);
			operation.showing = false;
			if (!this.isCurrent(operation)) {
				await this.host.hide(operation.id, 0);
				return;
			}
			operation.displayed = true;
			operation.shownAt = this.scheduler.now();
			operation.minimumVisibleTimer = this.scheduler.schedule(() => {
				operation.minimumVisibleElapsed = true;
				void this.dismissIfEligible(operation);
			}, this.minimumVisibleMs);
			await this.dismissIfEligible(operation);
		} catch (error) {
			operation.showing = false;
			this.logFailure('show', error);
			await this.dismiss(operation, 0);
		}
	}

	private async complete(
		operation: ActiveProjectLoadingSplash,
		outcome: ProjectLoadingSplashOutcome
	): Promise<void> {
		if (!this.isCurrent(operation) || operation.completion !== undefined) {
			return;
		}
		operation.completion = outcome;
		if (outcome === 'failure') {
			await this.dismiss(operation, 0);
			return;
		}
		await this.dismissIfEligible(operation);
	}

	private async dismissIfEligible(operation: ActiveProjectLoadingSplash): Promise<void> {
		if (operation.completion !== 'success'
			|| !operation.projectPresentationReady
			|| !operation.displayed
			|| !operation.minimumVisibleElapsed) {
			return;
		}
		await this.dismiss(operation, this.fadeDurationMs);
	}

	private async dismiss(operation: ActiveProjectLoadingSplash, fadeDurationMs: number): Promise<void> {
		if (!this.isCurrent(operation)) {
			return;
		}
		this.activeOperation = undefined;
		operation.minimumVisibleTimer.dispose();
		if (!operation.displayed) {
			return;
		}
		try {
			await this.host.hide(operation.id, fadeDurationMs);
		} catch (error) {
			this.logFailure('hide', error);
		}
	}

	private isCurrent(operation: ActiveProjectLoadingSplash): boolean {
		return !this.disposed && this.activeOperation === operation;
	}

	private logFailure(action: string, error: unknown): void {
		this.logger.appendLine(`Failed to ${action} JScene3D Project loading splash: ${errorMessage(error)}`);
	}
}

/** Parses only the descriptor identity fields needed for non-authoritative loading presentation. */
export function projectLoadingMetadata(
	descriptor: unknown,
	fallbackName: string,
	iconUri: string | undefined
): ProjectLoadingMetadata {
	if (!isRecord(descriptor) || !isRecord(descriptor.identity)) {
		return { name: fallbackName, authors: [] };
	}
	const identity = descriptor.identity;
	return {
		name: nonBlankString(identity.name) ?? fallbackName,
		version: nonBlankString(identity.version),
		description: nonBlankString(identity.description),
		authors: Array.isArray(descriptor.authors)
			? descriptor.authors.flatMap(author => isRecord(author) ? nonBlankString(author.name) ?? [] : [])
			: [],
		iconUri
	};
}

function fallbackMetadata(location: ProjectLocation): ProjectLoadingMetadata {
	return { name: candidateName(localProjectPath(location)), authors: [] };
}

function candidateName(path: string): string {
	const name = path.replaceAll('\\', '/').split('/').pop() ?? path;
	return name.toLowerCase().endsWith('.j3d') ? name.slice(0, -4) : name;
}

function nonBlankString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const completedOperation: ProjectLoadingSplashOperation = {
	complete: () => Promise.resolve()
};
