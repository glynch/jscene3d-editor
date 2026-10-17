/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type { InspectorSnapshotDto } from '../protocol/authoringProtocol';
import { InspectorEditCoordinator } from './inspectorEditCoordinator';
import { createInspectorPresentation, type InspectorTranslate } from './inspectorPresentation';
import { InspectorState } from './inspectorState';
import { createInspectorDocumentIdentity, inspectorWebviewHtml } from './inspectorWebviewDocument';
import { InspectorWebviewLifecycle } from './inspectorWebviewLifecycle';
import { isInspectorWebviewMessage } from './inspectorWebviewProtocol';

export const inspectorViewId = 'jscene3d.inspector';
export const inspectorFocusCommandId = `${inspectorViewId}.focus`;
export const inspectorAutomaticRevealCommandId = 'jscene3d.workbench.revealInspectorAutomatically';

export type InspectorCommandExecutor = (command: string) => PromiseLike<unknown> | unknown;

/** Activates the Inspector's Secondary Side Bar container through Code OSS's generated view command. */
export async function revealInspector(executeCommand: InspectorCommandExecutor): Promise<void> {
	await executeCommand(inspectorFocusCommandId);
}

/** Requests a non-focusing Inspector reveal that respects workbench visibility intent. */
export async function revealInspectorAutomatically(executeCommand: InspectorCommandExecutor): Promise<void> {
	await executeCommand(inspectorAutomaticRevealCommandId);
}

/** Presents the complete Inspector snapshot without owning semantic selection or domain rules. */
export class InspectorViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private lastInspector: InspectorSnapshotDto | undefined;
	private readonly stateSubscription: { dispose(): void };
	private viewSubscriptions: vscode.Disposable[] = [];
	private documentLifecycle: InspectorWebviewLifecycle | undefined;

	constructor(
		private readonly state: InspectorState,
		private readonly language: string,
		private readonly translate: InspectorTranslate,
		private readonly edits: Pick<InspectorEditCoordinator, 'edit'>
	) {
		this.stateSubscription = state.onDidChange(() => this.render());
	}

	get visible(): boolean {
		return this.view?.visible ?? false;
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.detachView();
		this.view = view;
		view.webview.options = { enableScripts: true };
		this.documentLifecycle = new InspectorWebviewLifecycle({
			initializeDocument: documentId => view.webview.html = inspectorWebviewHtml(
				view.webview.cspSource, documentId, this.language),
			postMessage: message => view.webview.postMessage(message)
		}, createInspectorDocumentIdentity);
		this.viewSubscriptions = [
			view.webview.onDidReceiveMessage(message => this.acceptMessage(message)),
			view.onDidChangeVisibility(() => {
				if (this.view !== view) {
					return;
				}
				if (view.visible) {
					this.documentLifecycle?.activate();
				} else {
					this.documentLifecycle?.deactivate();
				}
			}),
			view.onDidDispose(() => {
				if (this.view === view) {
					this.detachView();
				}
			})
		];
		this.render();
		if (view.visible) {
			this.documentLifecycle.activate();
		}
	}

	/** Commits valid pending numeric input or rejects the lifecycle action while local input is invalid. */
	prepareForDocumentClose(): Promise<boolean> {
		return this.documentLifecycle?.prepareForDocumentClose() ?? Promise.resolve(true);
	}

	dispose(): void {
		this.stateSubscription.dispose();
		this.detachView();
	}

	private acceptMessage(value: unknown): void {
		if (!isInspectorWebviewMessage(value)) {
			return;
		}
		if (value.type === 'ready') {
			this.documentLifecycle?.acceptReady(value.documentId);
			return;
		}
		if (value.type === 'presentationApplied') {
			this.documentLifecycle?.acceptPresentationApplied(value.documentId, value.deliveryId);
			return;
		}
		if (!this.documentLifecycle?.isCurrentDocument(value.documentId)) {
			return;
		}
		if (value.type === 'prepareForDocumentCloseResult') {
			this.documentLifecycle.acceptCloseResult(value.documentId, value.requestId, value.accepted);
			return;
		}
		if (value.type === 'editProperty') {
			void this.edits.edit({
				groupId: value.groupId,
				propertyId: value.propertyId,
				candidate: value.candidate
			}, expectedInspector => {
				if (this.lastInspector === expectedInspector) {
					this.render(true);
				}
			});
			return;
		}
		try {
			this.state.selectGroup(value.groupId);
		} catch {
			// A stale webview message is ignored; the next state render is authoritative.
		}
	}

	private render(force = false): void {
		const lifecycle = this.documentLifecycle;
		if (lifecycle === undefined) {
			return;
		}
		const snapshot = this.state.snapshot;
		this.lastInspector = snapshot.status === 'ready' ? snapshot.inspector : undefined;
		lifecycle.update(
			createInspectorPresentation(snapshot, this.translate),
			snapshot.status === 'ready' ? snapshot.inspector : snapshot,
			force
		);
	}

	private detachView(): void {
		this.documentLifecycle?.dispose();
		this.documentLifecycle = undefined;
		for (const subscription of this.viewSubscriptions) {
			subscription.dispose();
		}
		this.viewSubscriptions = [];
		this.view = undefined;
		this.lastInspector = undefined;
	}
}
