/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SceneTransformEditEvent } from '../sceneView/sceneViewRegistration';
import { AcceptedDefinitionEdit, DefinitionMutationOutcome } from './authoredDefinitionLifecycle';
import { AuthoredDefinitionState } from './authoredDefinitionState';

/** Minimal authoritative lifecycle surface needed by interactive Scene transform edits. */
export interface InteractiveDefinitionEditLifecycle {
	interact(resource: string, target: ReturnType<typeof mutationTarget>,
		phase: 'begin' | 'update' | 'commit' | 'cancel', editId: string,
		value?: { readonly kind: 'number-array'; readonly literals: readonly string[] }): Promise<DefinitionMutationOutcome>;
	reconcile(resource: string): Promise<void>;
}

interface DeferredResult {
	readonly promise: Promise<boolean>;
	resolve(value: boolean): void;
}

interface PendingUpdate {
	event: SceneTransformEditEvent;
	readonly waiters: DeferredResult[];
}

interface PendingTerminal {
	readonly event: SceneTransformEditEvent;
	readonly waiters: DeferredResult[];
}

interface InteractiveTransaction {
	readonly resource: string;
	readonly begin: SceneTransformEditEvent;
	readonly beginResult: DeferredResult;
	started: boolean;
	running: boolean;
	pendingUpdate?: PendingUpdate;
	terminal?: PendingTerminal;
}

/** Owns ordering, coalescing, reconciliation, and terminal cleanup for Scene transform edits. */
export class InteractiveDefinitionEditCoordinator {
	private readonly transactions = new Map<string, InteractiveTransaction>();
	private disposed = false;

	constructor(
		private readonly lifecycle: InteractiveDefinitionEditLifecycle,
		private readonly definitions: AuthoredDefinitionState,
		private readonly recordEdit: (resource: string, edit: AcceptedDefinitionEdit) => Promise<void>
	) { }

	accept(event: SceneTransformEditEvent): Promise<boolean> {
		if (this.disposed || event.phase === 'blocked') {
			return Promise.resolve(event.phase === 'blocked');
		}
		if (event.phase === 'begin') {
			return this.begin(event);
		}
		const transaction = this.transactions.get(event.editId);
		if (transaction === undefined) {
			return Promise.resolve(event.phase === 'cancel');
		}
		if (!sameTransaction(transaction.begin, event)) {
			return this.fail(transaction);
		}
		return event.phase === 'update'
			? this.update(transaction, event)
			: this.terminate(transaction, event);
	}

	async cancelResource(resource: string): Promise<void> {
		const transactions = Array.from(this.transactions.values()).filter(value => value.resource === resource);
		await Promise.all(transactions.map(transaction => this.cancel(transaction)));
	}

	async cancelAll(): Promise<void> {
		await Promise.all(Array.from(this.transactions.values(), transaction => this.cancel(transaction)));
	}

	dispose(): void {
		this.disposed = true;
		void this.cancelAll().finally(() => {
			for (const transaction of this.transactions.values()) {
				this.resolveOutstanding(transaction, false);
			}
			this.transactions.clear();
		});
	}

	private begin(event: SceneTransformEditEvent): Promise<boolean> {
		if (this.transactions.has(event.editId)) {
			return Promise.resolve(false);
		}
		const definition = this.definitions.active;
		if (definition === undefined || definition.assetId !== event.definitionAssetId
			|| event.authoredDefinitionAssetId !== definition.assetId) {
			return Promise.resolve(false);
		}
		const beginResult = deferredResult();
		const transaction: InteractiveTransaction = {
			resource: definition.resource,
			begin: event,
			beginResult,
			started: false,
			running: false
		};
		this.transactions.set(event.editId, transaction);
		this.schedule(transaction);
		return beginResult.promise;
	}

	private update(transaction: InteractiveTransaction, event: SceneTransformEditEvent): Promise<boolean> {
		const waiter = deferredResult();
		if (transaction.terminal !== undefined) {
			waiter.resolve(false);
			return waiter.promise;
		}
		if (transaction.pendingUpdate === undefined) {
			transaction.pendingUpdate = { event, waiters: [waiter] };
		} else {
			transaction.pendingUpdate.event = event;
			transaction.pendingUpdate.waiters.push(waiter);
		}
		this.schedule(transaction);
		return waiter.promise;
	}

	private terminate(transaction: InteractiveTransaction, event: SceneTransformEditEvent): Promise<boolean> {
		const waiter = deferredResult();
		if (transaction.terminal === undefined) {
			transaction.terminal = { event, waiters: [waiter] };
		} else if (transaction.terminal.event.phase === event.phase) {
			transaction.terminal.waiters.push(waiter);
		} else {
			waiter.resolve(false);
		}
		this.schedule(transaction);
		return waiter.promise;
	}

	private cancel(transaction: InteractiveTransaction): Promise<boolean> {
		const event: SceneTransformEditEvent = { ...transaction.begin, phase: 'cancel' };
		return this.terminate(transaction, event);
	}

	private schedule(transaction: InteractiveTransaction): void {
		if (transaction.running) {
			return;
		}
		transaction.running = true;
		void this.drain(transaction).catch(() => this.fail(transaction));
	}

	private async drain(transaction: InteractiveTransaction): Promise<void> {
		if (!transaction.started) {
			const accepted = await this.apply(transaction, transaction.begin);
			transaction.started = accepted;
			transaction.beginResult.resolve(accepted);
			if (!accepted) {
				await this.fail(transaction);
				return;
			}
		}
		while (transaction.pendingUpdate !== undefined) {
			const pending = transaction.pendingUpdate;
			transaction.pendingUpdate = undefined;
			const accepted = await this.apply(transaction, pending.event);
			pending.waiters.forEach(waiter => waiter.resolve(accepted));
			if (!accepted) {
				await this.fail(transaction);
				return;
			}
		}
		const terminal = transaction.terminal;
		if (terminal !== undefined) {
			const accepted = await this.apply(transaction, terminal.event);
			terminal.waiters.forEach(waiter => waiter.resolve(accepted));
			this.transactions.delete(transaction.begin.editId);
			return;
		}
		transaction.running = false;
		if (transaction.pendingUpdate !== undefined || transaction.terminal !== undefined) {
			this.schedule(transaction);
		}
	}

	private async apply(transaction: InteractiveTransaction, event: SceneTransformEditEvent): Promise<boolean> {
		if (event.phase === 'blocked') {
			return false;
		}
		const outcome = await this.lifecycle.interact(
			transaction.resource,
			mutationTarget(event),
			event.phase,
			event.editId,
			event.phase === 'update' ? { kind: 'number-array', literals: event.literals } : undefined
		);
		if (event.phase === 'commit' && outcome.status === 'accepted') {
			await this.recordEdit(transaction.resource, outcome.edit);
		}
		return outcome.status !== 'rejected';
	}

	private async fail(transaction: InteractiveTransaction): Promise<boolean> {
		if (!this.transactions.delete(transaction.begin.editId)) {
			return false;
		}
		if (transaction.started) {
			try {
				await this.lifecycle.interact(
					transaction.resource,
					mutationTarget(transaction.begin),
					'cancel',
					transaction.begin.editId);
			} catch {
				try {
					await this.lifecycle.reconcile(transaction.resource);
				} catch {
					// The authoring process may already be unavailable; its working copy cannot remain live.
				}
			}
		}
		this.resolveOutstanding(transaction, false);
		return false;
	}

	private resolveOutstanding(transaction: InteractiveTransaction, value: boolean): void {
		transaction.beginResult.resolve(value);
		transaction.pendingUpdate?.waiters.forEach(waiter => waiter.resolve(value));
		transaction.terminal?.waiters.forEach(waiter => waiter.resolve(value));
	}
}

function mutationTarget(event: SceneTransformEditEvent) {
	return {
		kind: 'component-property' as const,
		occurrence: { definitionAssetId: event.definitionAssetId, entityPath: event.entityPath },
		entityId: event.authoredEntityId,
		componentId: event.componentId,
		propertyId: event.propertyId
	};
}

function sameTransaction(left: SceneTransformEditEvent, right: SceneTransformEditEvent): boolean {
	return left.definitionAssetId === right.definitionAssetId
		&& left.authoredDefinitionAssetId === right.authoredDefinitionAssetId
		&& left.authoredEntityId === right.authoredEntityId && left.componentId === right.componentId
		&& left.propertyId === right.propertyId && left.entityPath.length === right.entityPath.length
		&& left.entityPath.every((value, index) => value === right.entityPath[index]);
}

function deferredResult(): DeferredResult {
	let resolve!: (value: boolean) => void;
	const promise = new Promise<boolean>(accept => resolve = accept);
	return { promise, resolve };
}
