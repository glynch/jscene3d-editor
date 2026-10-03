/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoredDefinitionResource, AuthoredDefinitionState } from '../definition/authoredDefinitionState';
import { SceneViewSynchronizationOutcome } from './sceneViewLifecycle';

/** Scene View lifecycle operations coordinated by the feature registration. */
export interface SceneViewLifecycleOperations {
	synchronize(definition: AuthoredDefinitionResource): Promise<SceneViewSynchronizationOutcome>;
	close(resource: string): Promise<void>;
	closeAll(): Promise<void>;
}

/** Connects definition-state changes and disposal to the independently testable Scene View lifecycle. */
export class SceneViewRegistration implements SceneViewLifecycleOperations {
	private readonly stateSubscription: { dispose(): void };
	private disposed = false;

	constructor(
		state: AuthoredDefinitionState,
		private readonly lifecycle: SceneViewLifecycleOperations,
		private readonly logger: { appendLine(message: string): void }
	) {
		this.stateSubscription = state.onDidChange(change => {
			if (change === 'snapshot' && state.active !== undefined) {
				void this.synchronize(state.active).catch(error => this.reportFailure('synchronize', error));
			}
		});
	}

	synchronize(definition: AuthoredDefinitionResource): Promise<SceneViewSynchronizationOutcome> {
		return this.lifecycle.synchronize(definition);
	}

	close(resource: string): Promise<void> {
		return this.lifecycle.close(resource);
	}

	closeAll(): Promise<void> {
		return this.lifecycle.closeAll();
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
