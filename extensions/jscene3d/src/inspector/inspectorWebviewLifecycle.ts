/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InspectorPresentation } from './inspectorPresentation';
import type { InspectorHostToWebviewMessage } from './inspectorWebviewProtocol';

/** Host operations used by one Inspector webview attachment. */
export interface InspectorWebviewLifecycleSurface {
	initializeDocument(documentId: string): void;
	postMessage(message: InspectorHostToWebviewMessage): PromiseLike<boolean>;
}

interface DesiredPresentation {
	readonly revision: number;
	readonly contentRevision: number;
	readonly presentation: InspectorPresentation;
}

interface PendingDelivery {
	readonly documentId: string;
	readonly deliveryId: number;
	readonly revision: number;
	readonly contentRevision: number;
}

interface PendingClose {
	readonly documentId: string;
	readonly complete: (accepted: boolean) => void;
}

/** Synchronizes the latest desired Inspector presentation with one replaceable browser document. */
export class InspectorWebviewLifecycle {
	private documentId: string | undefined;
	private ready = false;
	private disposed = false;
	private desired: DesiredPresentation | undefined;
	private desiredIdentity: object | undefined;
	private presentationRevision = 0;
	private contentRevision = 0;
	private acknowledgedRevision = 0;
	private acknowledgedContentRevision = -1;
	private deliverySequence = 0;
	private pendingDelivery: PendingDelivery | undefined;
	private closeSequence = 0;
	private readonly pendingCloses = new Map<number, PendingClose>();

	constructor(
		private readonly surface: InspectorWebviewLifecycleSurface,
		private readonly createIdentity: () => string
	) { }

	/** Records the latest desired presentation, collapsing updates while no document can receive them. */
	update(presentation: InspectorPresentation, identity: object | undefined, force = false): void {
		if (this.disposed) {
			return;
		}
		if (force || identity !== this.desiredIdentity) {
			this.contentRevision++;
		}
		this.desiredIdentity = identity;
		this.desired = {
			revision: ++this.presentationRevision,
			contentRevision: this.contentRevision,
			presentation
		};
		this.deliverLatest();
	}

	/** Creates a fresh browser document for the current visible attachment. */
	activate(): void {
		if (this.disposed || this.documentId !== undefined) {
			return;
		}
		this.documentId = this.createIdentity();
		this.ready = false;
		this.pendingDelivery = undefined;
		this.acknowledgedRevision = 0;
		this.acknowledgedContentRevision = -1;
		this.surface.initializeDocument(this.documentId);
	}

	/** Invalidates the hidden document so restoration starts with a new identity and current state. */
	deactivate(): void {
		if (this.disposed || this.documentId === undefined) {
			return;
		}
		this.invalidateDocument();
	}

	acceptReady(documentId: string): void {
		if (this.disposed || this.documentId !== documentId) {
			return;
		}
		this.ready = true;
		this.deliverLatest();
	}

	acceptPresentationApplied(documentId: string, deliveryId: number): void {
		const delivery = this.pendingDelivery;
		if (!this.isCurrentDocument(documentId)
			|| delivery?.documentId !== documentId || delivery.deliveryId !== deliveryId) {
			return;
		}
		this.pendingDelivery = undefined;
		this.acknowledgedRevision = delivery.revision;
		this.acknowledgedContentRevision = delivery.contentRevision;
		this.deliverLatest();
	}

	isCurrentDocument(documentId: string): boolean {
		return !this.disposed && this.ready && this.documentId === documentId;
	}

	/** Requests browser-local numeric draft settlement for the current ready document. */
	prepareForDocumentClose(): Promise<boolean> {
		const documentId = this.documentId;
		if (this.disposed) {
			return Promise.resolve(false);
		}
		if (!this.ready || documentId === undefined) {
			return Promise.resolve(true);
		}
		const requestId = ++this.closeSequence;
		return new Promise<boolean>(resolve => {
			let completed = false;
			const complete = (accepted: boolean) => {
				if (completed) {
					return;
				}
				completed = true;
				clearTimeout(timeout);
				this.pendingCloses.delete(requestId);
				resolve(accepted);
			};
			const timeout = setTimeout(() => complete(false), 2000);
			this.pendingCloses.set(requestId, { documentId, complete });
			void Promise.resolve(this.surface.postMessage({
				type: 'prepareForDocumentClose', documentId, requestId
			})).then(delivered => {
				if (!delivered) {
					complete(true);
				}
			}, () => complete(false));
		});
	}

	acceptCloseResult(documentId: string, requestId: number, accepted: boolean): void {
		const pending = this.pendingCloses.get(requestId);
		if (this.isCurrentDocument(documentId) && pending?.documentId === documentId) {
			pending.complete(accepted);
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.invalidateDocument();
		this.desired = undefined;
		this.desiredIdentity = undefined;
	}

	private deliverLatest(): void {
		const documentId = this.documentId;
		const desired = this.desired;
		if (!this.ready || documentId === undefined || desired === undefined
			|| this.pendingDelivery !== undefined || desired.revision <= this.acknowledgedRevision) {
			return;
		}
		const deliveryId = ++this.deliverySequence;
		const message: InspectorHostToWebviewMessage = desired.contentRevision === this.acknowledgedContentRevision
			&& desired.presentation.status === 'ready'
			? {
				type: 'focusGroup', documentId, deliveryId,
				groupId: desired.presentation.selectedGroupId
			}
			: { type: 'render', documentId, deliveryId, bootstrap: desired.presentation };
		const delivery = {
			documentId, deliveryId, revision: desired.revision, contentRevision: desired.contentRevision
		};
		this.pendingDelivery = delivery;
		void Promise.resolve(this.surface.postMessage(message)).then(delivered => {
			if (!delivered) {
				this.rejectDelivery(delivery);
			}
		}, () => this.rejectDelivery(delivery));
	}

	private rejectDelivery(delivery: PendingDelivery): void {
		if (this.pendingDelivery === delivery) {
			this.pendingDelivery = undefined;
		}
	}

	private invalidateDocument(): void {
		this.ready = false;
		this.documentId = undefined;
		this.pendingDelivery = undefined;
		this.acknowledgedRevision = 0;
		this.acknowledgedContentRevision = -1;
		for (const pending of Array.from(this.pendingCloses.values())) {
			pending.complete(false);
		}
	}
}
