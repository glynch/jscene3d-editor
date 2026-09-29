/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	ConnectionScopedResult,
	DefinitionBackupResultDto,
	DefinitionMutationDto,
	DefinitionOpenResultDto,
	DefinitionOperationResultDto,
	InspectorMutationTargetDto,
	ProjectDiagnosticDto
} from '../protocol/authoringProtocol';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from './authoredDefinitionState';

/** Java operations required by the native custom-document bridge. */
export interface AuthoredDefinitionLifecycleClient {
	openDefinition(projectGeneration: number, assetId: string): Promise<ConnectionScopedResult<DefinitionOpenResultDto>>;
	mutateDefinition(projectGeneration: number, assetId: string, revision: number,
		target: InspectorMutationTargetDto, mutation: DefinitionMutationDto): Promise<DefinitionOperationResultDto>;
	undoDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto>;
	redoDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto>;
	saveDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto>;
	revertDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto>;
	backupDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionBackupResultDto>;
	restoreDefinitionBackup(projectGeneration: number, assetId: string, revision: number,
		backup: string): Promise<DefinitionOperationResultDto>;
}

export interface AcceptedDefinitionEdit {
	readonly label: string;
	undo(): Promise<void>;
	redo(): Promise<void>;
}

export type DefinitionMutationOutcome =
	| { readonly status: 'accepted'; readonly edit: AcceptedDefinitionEdit }
	| { readonly status: 'noOp' }
	| { readonly status: 'rejected'; readonly outcome: string; readonly diagnostics: readonly ProjectDiagnosticDto[] };

/** Coordinates Java authority without duplicating content, revision, dirty, or history state. */
export class AuthoredDefinitionLifecycle {
	private operations: Promise<void> = Promise.resolve();

	constructor(
		private readonly client: AuthoredDefinitionLifecycleClient,
		private readonly definitions: AuthoredDefinitionState,
		private readonly publishDiagnostics: (diagnostics: readonly ProjectDiagnosticDto[]) => void
	) { }

	mutate(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		return this.exclusive(async () => {
			const document = this.requireActiveDocument(target);
			const result = await this.client.mutateDefinition(
				document.projectGeneration, document.assetId, document.snapshot.revision, target, mutation);
			this.publishDiagnostics(result.diagnostics);
			if (result.outcome === 'accepted') {
				await this.refresh(document.resource);
				return {
					status: 'accepted',
					edit: {
						label,
						undo: () => this.history(document.resource, 'undo'),
						redo: () => this.history(document.resource, 'redo')
					}
				};
			}
			if (result.outcome === 'no-op') {
				return { status: 'noOp' };
			}
			if (result.outcome === 'stale-revision') {
				await this.refresh(document.resource);
			}
			return { status: 'rejected', outcome: result.outcome, diagnostics: result.diagnostics };
		});
	}

	async save(resource: string): Promise<void> {
		await this.exclusive(async () => {
			const document = this.requireDocument(resource);
			const result = await this.client.saveDefinition(
				document.projectGeneration, document.assetId, document.snapshot.revision);
			this.publishDiagnostics(result.diagnostics);
			if (result.outcome !== 'saved' && result.outcome !== 'no-op') {
				throw operationFailure('save', result);
			}
			await this.refresh(resource);
		});
	}

	async revert(resource: string): Promise<void> {
		await this.exclusive(async () => {
			const document = this.requireDocument(resource);
			const result = await this.client.revertDefinition(
				document.projectGeneration, document.assetId, document.snapshot.revision);
			this.publishDiagnostics(result.diagnostics);
			if (result.outcome !== 'reverted' && result.outcome !== 'no-op') {
				throw operationFailure('revert', result);
			}
			await this.refresh(resource);
		});
	}

	backup(resource: string): Promise<string> {
		return this.exclusive(async () => {
			const document = this.requireDocument(resource);
			if (!document.snapshot.context.editable) {
				throw new Error('Generated definitions do not support recovery backup');
			}
			const result = await this.client.backupDefinition(
				document.projectGeneration, document.assetId, document.snapshot.revision);
			if (result.outcome !== 'backed-up' || result.backup === null) {
				throw new Error(`Authoring definition backup failed: ${result.outcome}`);
			}
			return result.backup;
		});
	}

	async restore(resource: string, backup: string): Promise<void> {
		await this.exclusive(async () => {
			const document = this.requireDocument(resource);
			const result = await this.client.restoreDefinitionBackup(
				document.projectGeneration, document.assetId, document.snapshot.revision, backup);
			this.publishDiagnostics(result.diagnostics);
			if (result.outcome !== 'restored' && result.outcome !== 'no-op') {
				throw operationFailure('restore backup', result);
			}
			await this.refresh(resource);
		});
	}

	/** Rebinds an explicitly backed-up tab to a freshly opened project/session before B3 restoration. */
	async recover(resource: string, projectGeneration: number, assetId: string, backup: string): Promise<void> {
		await this.exclusive(async () => {
			const response = await this.client.openDefinition(projectGeneration, assetId);
			if (!response.result.opened || response.result.projectGeneration !== projectGeneration) {
				throw new Error(`Recovery definition open failed: ${response.result.failureCode ?? 'identity changed'}`);
			}
			this.definitions.register(resource, projectGeneration, response.result.definition);
			const result = await this.client.restoreDefinitionBackup(
				projectGeneration, assetId, response.result.definition.revision, backup);
			this.publishDiagnostics(result.diagnostics);
			if (result.outcome !== 'restored' && result.outcome !== 'no-op') {
				throw operationFailure('restore backup', result);
			}
			await this.refresh(resource);
		});
	}

	private history(resource: string, operation: 'undo' | 'redo'): Promise<void> {
		return this.exclusive(async () => {
			const document = this.requireDocument(resource);
			const result = operation === 'undo'
				? await this.client.undoDefinition(document.projectGeneration, document.assetId, document.snapshot.revision)
				: await this.client.redoDefinition(document.projectGeneration, document.assetId, document.snapshot.revision);
			this.publishDiagnostics(result.diagnostics);
			if (result.outcome !== 'accepted' && result.outcome !== 'no-op') {
				if (result.outcome === 'stale-revision') {
					await this.refresh(resource);
				}
				throw operationFailure(operation, result);
			}
			await this.refresh(resource);
		});
	}

	private async refresh(resource: string): Promise<AuthoredDefinitionResource> {
		const current = this.requireDocument(resource);
		const response = await this.client.openDefinition(current.projectGeneration, current.assetId);
		if (!response.result.opened
			|| response.result.projectGeneration !== current.projectGeneration
			|| response.result.definition.context.assetId !== current.assetId) {
			throw new Error(`Authoritative definition refresh failed: ${response.result.failureCode ?? 'identity changed'}`);
		}
		return this.definitions.update(resource, response.result.definition);
	}

	private requireActiveDocument(target: InspectorMutationTargetDto): AuthoredDefinitionResource {
		const active = this.definitions.active;
		if (active === undefined || target.occurrence.definitionAssetId !== active.assetId) {
			throw new Error('Inspector mutation does not belong to the active authored definition');
		}
		if (!active.snapshot.context.editable) {
			throw new Error('Generated definitions are read-only');
		}
		return active;
	}

	private requireDocument(resource: string): AuthoredDefinitionResource {
		const document = this.definitions.resolve(resource);
		if (document === undefined) {
			throw new Error('This JScene3D definition belongs to a project session that is no longer active.');
		}
		return document;
	}

	private exclusive<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operations.then(operation);
		this.operations = result.then(() => undefined, () => undefined);
		return result;
	}
}

function operationFailure(operation: string, result: DefinitionOperationResultDto): Error {
	return new Error(`Authoring definition ${operation} failed: ${result.outcome}`);
}
