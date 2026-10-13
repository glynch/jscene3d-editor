/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DefinitionMutationDto, InspectorMutationTargetDto } from '../protocol/authoringProtocol';
import { SceneTransformEditEvent } from '../sceneView/sceneViewRegistration';
import { AcceptedDefinitionEdit, AuthoredDefinitionLifecycle, DefinitionMutationOutcome } from './authoredDefinitionLifecycle';
import { AuthoredDefinitionState } from './authoredDefinitionState';
import { InteractiveDefinitionEditCoordinator } from './interactiveDefinitionEditCoordinator';

/** Coordinates Inspector and viewport edits before they enter the native custom-editor edit stream. */
export class AuthoredDefinitionEditBridge implements vscode.Disposable {
	private readonly pending = new Set<Promise<unknown>>();
	private readonly interactive: InteractiveDefinitionEditCoordinator;

	constructor(
		private readonly lifecycle: AuthoredDefinitionLifecycle,
		private readonly state: AuthoredDefinitionState,
		private readonly record: (resource: string, edit: AcceptedDefinitionEdit) => Promise<void>
	) {
		this.interactive = new InteractiveDefinitionEditCoordinator(lifecycle, state, record);
	}

	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		return this.track(this.applyInspectorMutation(target, mutation, label));
	}

	acceptSceneTransform(event: SceneTransformEditEvent): Promise<boolean> {
		if (event.phase === 'blocked') {
			void vscode.window.showWarningMessage(vscode.l10n.t(
				'This transform is inherited from an Entity Definition and cannot be edited from the Scene.'));
			return Promise.resolve(true);
		}
		return this.track(this.interactive.accept(event));
	}

	cancelResource(resource: string): Promise<void> {
		return this.interactive.cancelResource(resource);
	}

	cancelAll(): Promise<void> {
		return this.interactive.cancelAll();
	}

	async waitForPending(): Promise<void> {
		while (this.pending.size > 0) {
			await Promise.all(this.pending);
		}
	}

	dispose(): void {
		this.interactive.dispose();
	}

	private async applyInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome> {
		const outcome = await this.lifecycle.mutate(target, mutation, label);
		if (outcome.status !== 'accepted') {
			return outcome;
		}
		const active = this.state.active;
		if (active === undefined) {
			throw new Error('Accepted Inspector mutation has no active definition document');
		}
		await this.record(active.resource, outcome.edit);
		return outcome;
	}

	private track<T>(pending: Promise<T>): Promise<T> {
		this.pending.add(pending);
		void pending.then(
			() => this.pending.delete(pending),
			() => this.pending.delete(pending)
		);
		return pending;
	}
}
