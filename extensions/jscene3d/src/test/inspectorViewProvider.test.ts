/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import type { InspectorEditCoordinator, InspectorEditRequest, InspectorPresentationRefresh } from '../inspector/inspectorEditCoordinator';
import type { InspectorHostToWebviewMessage } from '../inspector/inspectorWebviewProtocol';
import { InspectorState, InspectorStateSnapshot } from '../inspector/inspectorState';
import { InspectorViewProvider } from '../inspector/inspectorView';
import { InspectorMutationTargetDto, InspectorSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D Inspector view provider', () => {
	test('attaches the webview, renders state changes, and dispatches selection and mutations', async () => {
		const state = new TestInspectorState(readyState(inspectorSnapshot('Cube'), 'entity'));
		const edits = new TestEditCoordinator(state);
		const provider = providerFor(state, edits);
		const view = new TestWebviewView();

		provider.resolveWebviewView(view as unknown as vscode.WebviewView);
		const documentId = readyDocument(view);
		acknowledgeLastPresentation(view, documentId);
		state.publish(readyState(inspectorSnapshot('Renamed Cube'), 'transform'));
		await settled();
		acknowledgeLastPresentation(view, documentId);
		view.webview.accept({ type: 'selectGroup', documentId, groupId: 'entity' });
		view.webview.accept({
			type: 'editProperty', documentId, groupId: 'transform', propertyId: 'position',
			candidate: { kind: 'number-array', literals: ['4', '5', '6'] }
		});
		await settled();

		assert.strictEqual(view.webview.options.enableScripts, true);
		assert.doesNotMatch(view.webview.html, /"title":"Cube"/);
		assert.deepStrictEqual(renderSummary(view.webview.messages[1]), {
			type: 'render', status: 'ready', title: 'Renamed Cube', selectedGroupId: 'transform',
			groups: [
				{ identity: 'entity', properties: [] },
				{ identity: 'transform', properties: [{ identity: 'position', editor: 'vector3' }] }
			]
		});
		assert.deepStrictEqual(state.selectedGroups, ['entity']);
		assert.deepStrictEqual(edits.calls, [{
			groupId: 'transform',
			propertyId: 'position',
			candidate: { kind: 'number-array', literals: ['4', '5', '6'] },
		}]);
	});

	test('delegates property identity without inspecting the authoritative snapshot', async () => {
		const state = new TestInspectorState(readyState(inspectorSnapshot('Cube'), 'entity'));
		const edits = new TestEditCoordinator(state);
		const provider = providerFor(state, edits);
		const view = new TestWebviewView();
		provider.resolveWebviewView(view as unknown as vscode.WebviewView);
		const documentId = readyDocument(view);
		acknowledgeLastPresentation(view, documentId);

		view.webview.accept({
			type: 'editProperty', documentId, groupId: 'transform', propertyId: 'missing',
			candidate: { kind: 'number-array', literals: ['4', '5', '6'] }
		});
		await settled();

		assert.deepStrictEqual(edits.calls, [{
			groupId: 'transform', propertyId: 'missing',
			candidate: { kind: 'number-array', literals: ['4', '5', '6'] }
		}]);
		assert.strictEqual(view.webview.messages.length, 2);
		assert.strictEqual((view.webview.messages[1] as { readonly type: string }).type, 'render');
	});

	test('recreates the document and replays the latest hidden selection without accepting the old document', async () => {
		const state = new TestInspectorState(readyState(inspectorSnapshot('Cube'), 'entity'));
		const provider = providerFor(state, new TestEditCoordinator(state));
		const view = new TestWebviewView();
		provider.resolveWebviewView(view as unknown as vscode.WebviewView);
		const documentA = readyDocument(view);
		acknowledgeLastPresentation(view, documentA);

		view.setVisible(false);
		state.publish(readyState(inspectorSnapshot('Crate'), 'entity'));
		assert.strictEqual(view.webview.messages.length, 1);
		view.setVisible(true);
		const documentB = documentIdentity(view.webview.html);
		assert.notStrictEqual(documentB, documentA);

		view.webview.accept({ type: 'ready', documentId: documentA });
		assert.strictEqual(view.webview.messages.length, 1);
		view.webview.accept({ type: 'ready', documentId: documentB });
		await settled();
		view.webview.accept({ type: 'selectGroup', documentId: documentA, groupId: 'transform' });

		assert.deepStrictEqual(renderSummary(view.webview.messages[1]), {
			type: 'render', status: 'ready', title: 'Crate', selectedGroupId: 'entity',
			groups: [
				{ identity: 'entity', properties: [] },
				{ identity: 'transform', properties: [{ identity: 'position', editor: 'vector3' }] }
			]
		});
		assert.deepStrictEqual(state.selectedGroups, []);
	});

	test('does not replay a stale mutation presentation into a recreated document', async () => {
		const state = new TestInspectorState(readyState(inspectorSnapshot('Cube'), 'transform'));
		const edits = new DeferredEditCoordinator(state);
		const provider = providerFor(state, edits);
		const view = new TestWebviewView();
		provider.resolveWebviewView(view as unknown as vscode.WebviewView);
		const documentA = readyDocument(view);
		acknowledgeLastPresentation(view, documentA);
		view.webview.accept({
			type: 'editProperty', documentId: documentA, groupId: 'transform', propertyId: 'position',
			candidate: { kind: 'number-array', literals: ['4', '5', '6'] }
		});

		view.setVisible(false);
		state.publish(readyState(inspectorSnapshot('Crate'), 'entity'));
		view.setVisible(true);
		const documentB = readyDocument(view);
		acknowledgeLastPresentation(view, documentB);
		const messagesBeforeCompletion = view.webview.messages.length;
		edits.complete();
		await settled();

		assert.strictEqual(view.webview.messages.length, messagesBeforeCompletion);
		assert.deepStrictEqual(renderSummary(view.webview.messages.at(-1)), {
			type: 'render', status: 'ready', title: 'Crate', selectedGroupId: 'entity',
			groups: [
				{ identity: 'entity', properties: [] },
				{ identity: 'transform', properties: [{ identity: 'position', editor: 'vector3' }] }
			]
		});
	});

	test('coordinates close preparation and disposes subscriptions and pending requests', async () => {
		const state = new TestInspectorState(readyState(inspectorSnapshot('Cube'), 'entity'));
		const provider = providerFor(state, new TestEditCoordinator(state));
		const view = new TestWebviewView();
		provider.resolveWebviewView(view as unknown as vscode.WebviewView);
		const documentId = readyDocument(view);
		acknowledgeLastPresentation(view, documentId);

		const acceptedClose = provider.prepareForDocumentClose();
		const request = view.webview.messages[1] as { readonly type: string; readonly requestId: number };
		view.webview.accept({
			type: 'prepareForDocumentCloseResult', documentId, requestId: request.requestId, accepted: true
		});
		assert.strictEqual(await acceptedClose, true);

		const interruptedClose = provider.prepareForDocumentClose();
		view.dispose();
		assert.strictEqual(await interruptedClose, false);
		assert.deepStrictEqual({
			messageListeners: view.webview.listenerCount,
			visibilityListeners: view.visibilityListenerCount,
			disposeListeners: view.disposeListenerCount,
			visible: provider.visible
		}, { messageListeners: 0, visibilityListeners: 0, disposeListeners: 0, visible: false });

		provider.dispose();
		assert.strictEqual(state.listenerCount, 0);
	});
});

class TestInspectorState {
	private readonly listeners = new Set<() => void>();
	readonly selectedGroups: string[] = [];

	constructor(public snapshot: InspectorStateSnapshot) { }

	get listenerCount(): number {
		return this.listeners.size;
	}

	onDidChange(listener: () => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	selectGroup(groupId: string): void {
		this.selectedGroups.push(groupId);
	}

	publish(snapshot: InspectorStateSnapshot): void {
		this.snapshot = snapshot;
		for (const listener of this.listeners) {
			listener();
		}
	}
}

class TestEditCoordinator implements Pick<InspectorEditCoordinator, 'edit'> {
	readonly calls: InspectorEditRequest[] = [];

	constructor(private readonly state: TestInspectorState) { }

	edit(request: InspectorEditRequest, refreshPresentation: InspectorPresentationRefresh): Promise<void> {
		this.calls.push(request);
		refreshPresentation(this.state.snapshot.status === 'ready' ? this.state.snapshot.inspector : undefined);
		return Promise.resolve();
	}
}

class DeferredEditCoordinator implements Pick<InspectorEditCoordinator, 'edit'> {
	private readonly completion = deferred<void>();

	constructor(private readonly state: TestInspectorState) { }

	async edit(_request: InspectorEditRequest, refreshPresentation: InspectorPresentationRefresh): Promise<void> {
		const expectedInspector = this.state.snapshot.status === 'ready' ? this.state.snapshot.inspector : undefined;
		await this.completion.promise;
		refreshPresentation(expectedInspector);
	}

	complete(): void {
		this.completion.resolve();
	}
}

class TestWebview {
	options: vscode.WebviewOptions = {};
	html = '';
	readonly cspSource = 'vscode-webview://test';
	readonly messages: unknown[] = [];
	private readonly listeners = new Set<(message: unknown) => void>();

	get listenerCount(): number {
		return this.listeners.size;
	}

	onDidReceiveMessage(listener: (message: unknown) => void): vscode.Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	postMessage(message: unknown): Thenable<boolean> {
		this.messages.push(message);
		return Promise.resolve(true);
	}

	accept(message: unknown): void {
		for (const listener of this.listeners) {
			listener(message);
		}
	}
}

class TestWebviewView {
	readonly webview = new TestWebview();
	visible = true;
	private readonly disposeListeners = new Set<() => void>();
	private readonly visibilityListeners = new Set<() => void>();

	get visibilityListenerCount(): number {
		return this.visibilityListeners.size;
	}

	get disposeListenerCount(): number {
		return this.disposeListeners.size;
	}

	onDidDispose(listener: () => void): vscode.Disposable {
		this.disposeListeners.add(listener);
		return { dispose: () => this.disposeListeners.delete(listener) };
	}

	onDidChangeVisibility(listener: () => void): vscode.Disposable {
		this.visibilityListeners.add(listener);
		return { dispose: () => this.visibilityListeners.delete(listener) };
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		for (const listener of this.visibilityListeners) {
			listener();
		}
	}

	dispose(): void {
		for (const listener of this.disposeListeners) {
			listener();
		}
		this.disposeListeners.clear();
		this.visibilityListeners.clear();
	}
}

function providerFor(state: TestInspectorState, edits: Pick<InspectorEditCoordinator, 'edit'>): InspectorViewProvider {
	return new InspectorViewProvider(
		state as unknown as InspectorState,
		'en',
		(message, ...args) => args.reduce((value, argument, index) => value.replace(`{${index}}`, argument), message),
		edits
	);
}

function readyState(inspector: InspectorSnapshotDto, selectedGroupId: string): InspectorStateSnapshot {
	return {
		status: 'ready',
		selection: {
			projectGeneration: 1,
			assetId: 'scene-a',
			occurrence: inspector.target.occurrence!,
			target: inspector.target
		},
		inspector,
		selectedGroupId
	};
}

function inspectorSnapshot(title: string): InspectorSnapshotDto {
	const occurrence = { definitionAssetId: 'scene-a', entityPath: ['cube'] };
	const target = { kind: 'local-entity' as const, source: 'file:///scene.json', identity: 'cube', occurrence };
	const position = { kind: 'array' as const, values: ['1', '2', '3'].map(decimal => ({ kind: 'number' as const, decimal })) };
	return {
		revision: 2, target, title, definitionOrigin: 'authored', provenance: 'local', editable: true,
		groups: [{
			identity: 'entity', kind: 'entity', label: 'Entity', description: null,
			componentId: null, componentType: null, metadataStatus: 'available', editable: true, properties: []
		}, {
			identity: 'transform', kind: 'component', label: 'Transform 3D', description: null,
			componentId: 'transform', componentType: { id: 'jscene3d/transform-3d', version: 1 },
			metadataStatus: 'available', editable: true,
			properties: [{
				identity: 'position', label: 'Position', description: null, valueKind: 'array', required: true,
				constraints: {
					elementKind: 'number', exactElementCount: 3, acceptedReferenceKinds: [],
					editor: { semantic: 'vector3', minimum: null, maximum: null }
				},
				state: {
					authoredValue: position, defaultValue: null, effectiveValue: position,
					origin: 'authored', validity: 'valid', editable: true, modified: false
				},
				mutationTarget: mutationTarget()
			}]
		}]
	};
}

function mutationTarget(): InspectorMutationTargetDto {
	return {
		kind: 'component-property',
		occurrence: { definitionAssetId: 'scene-a', entityPath: ['cube'] },
		entityId: 'cube', componentId: 'transform', propertyId: 'position'
	};
}

function renderSummary(message: unknown): object {
	const outbound = message as InspectorHostToWebviewMessage;
	if (outbound.type !== 'render' || outbound.bootstrap.status !== 'ready') {
		throw new Error('Expected a ready Inspector render message');
	}
	return {
		type: outbound.type,
		status: outbound.bootstrap.status,
		title: outbound.bootstrap.snapshot.title,
		selectedGroupId: outbound.bootstrap.selectedGroupId,
		groups: outbound.bootstrap.snapshot.groups.map(group => ({
			identity: group.identity,
			properties: group.properties.map(property => ({
				identity: property.identity, editor: property.propertyEditor.kind
			}))
		}))
	};
}

function readyDocument(view: TestWebviewView): string {
	const documentId = documentIdentity(view.webview.html);
	view.webview.accept({ type: 'ready', documentId });
	return documentId;
}

function acknowledgeLastPresentation(view: TestWebviewView, documentId: string): void {
	const message = view.webview.messages.at(-1) as InspectorHostToWebviewMessage;
	if (message.type !== 'render' && message.type !== 'focusGroup') {
		throw new Error('Expected an Inspector presentation message');
	}
	view.webview.accept({ type: 'presentationApplied', documentId, deliveryId: message.deliveryId });
}

function documentIdentity(html: string): string {
	const match = /const documentId = "([^"]+)"/.exec(html);
	assert.ok(match);
	return match[1];
}

async function settled(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(accept => resolve = accept);
	return { promise, resolve };
}
