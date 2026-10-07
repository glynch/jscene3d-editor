/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoredDefinitionResource, AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { HierarchyOccurrenceDto } from '../protocol/authoringProtocol';
import { ResolvedSceneViewSelection, SceneViewSelectionEvent, SceneViewSynchronizationOutcome } from './sceneViewLifecycle';

/** Scene View lifecycle operations coordinated by the feature registration. */
export interface SceneViewLifecycleOperations {
	synchronize(definition: AuthoredDefinitionResource): Promise<SceneViewSynchronizationOutcome>;
	close(resource: string): Promise<void>;
	closeAll(): Promise<void>;
	acceptSelection(event: SceneViewSelectionEvent): boolean;
}

interface SceneViewLifecycleAdapter extends Omit<SceneViewLifecycleOperations, 'acceptSelection'> {
	select(definition: AuthoredDefinitionResource, occurrence: HierarchyOccurrenceDto | null): Promise<void>;
	resolveSelection(event: SceneViewSelectionEvent): ResolvedSceneViewSelection | undefined;
}

/** Connects definition-state changes and disposal to the independently testable Scene View lifecycle. */
export class SceneViewRegistration implements SceneViewLifecycleOperations {
	private readonly stateSubscription: { dispose(): void };
	private disposed = false;

	constructor(
		private readonly state: AuthoredDefinitionState,
		private readonly lifecycle: SceneViewLifecycleAdapter,
		private readonly logger: { appendLine(message: string): void }
	) {
		this.stateSubscription = state.onDidChange(change => {
			if (change === 'snapshot' && state.active !== undefined) {
				void this.synchronize(state.active).catch(error => this.reportFailure('synchronize', error));
			}
			if (change === 'selection' && state.active !== undefined) {
				void this.lifecycle.select(state.active, state.selection?.occurrence ?? null)
					.catch(error => this.reportFailure('select', error));
			}
		});
	}

	async synchronize(definition: AuthoredDefinitionResource): Promise<SceneViewSynchronizationOutcome> {
		const outcome = await this.lifecycle.synchronize(definition);
		if (outcome.status !== 'failed' && outcome.status !== 'not-applicable' && outcome.status !== 'obsolete'
			&& this.state.active?.resource === definition.resource) {
			await this.lifecycle.select(definition, this.state.selection?.occurrence ?? null);
		}
		return outcome;
	}

	close(resource: string): Promise<void> {
		return this.lifecycle.close(resource);
	}

	closeAll(): Promise<void> {
		return this.lifecycle.closeAll();
	}

	acceptSelection(event: SceneViewSelectionEvent): boolean {
		const resolved = this.lifecycle.resolveSelection(event);
		if (resolved === undefined || this.state.active?.resource !== resolved.resource) {
			return false;
		}
		if (resolved.occurrence === null) {
			this.state.clearSelection();
			return true;
		}
		return this.state.selectOccurrence(resolved.occurrence);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.stateSubscription.dispose();
	}

	private reportFailure(operation: string, error: unknown): void {
		this.logger.appendLine(
			`Safe Scene View failed to ${operation}: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
