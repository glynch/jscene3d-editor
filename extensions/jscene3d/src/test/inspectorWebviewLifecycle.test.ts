/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { InspectorPresentation } from '../inspector/inspectorPresentation';
import {
	InspectorWebviewLifecycle,
	type InspectorWebviewLifecycleSurface
} from '../inspector/inspectorWebviewLifecycle';
import type { InspectorHostToWebviewMessage } from '../inspector/inspectorWebviewProtocol';

suite('JScene3D Inspector webview lifecycle', () => {
	test('waits for the current document and delivers only the latest presentation', async () => {
		const surface = new TestSurface();
		const identities = identitySequence('document-a');
		const lifecycle = new InspectorWebviewLifecycle(surface, identities);

		lifecycle.update(emptyPresentation('First'), undefined);
		lifecycle.activate();
		lifecycle.update(emptyPresentation('Second'), undefined);
		assert.deepStrictEqual(surface.messages, []);

		lifecycle.acceptReady('document-a');
		await settled();

		assert.deepStrictEqual(surface.documents, ['document-a']);
		assert.deepStrictEqual(surface.messages.map(renderLabel), ['Second']);
	});

	test('serializes delivery acknowledgements and collapses intervening updates to the latest state', async () => {
		const surface = new TestSurface();
		const lifecycle = new InspectorWebviewLifecycle(surface, identitySequence('document-a'));
		const firstIdentity = {};
		const secondIdentity = {};
		lifecycle.update(readyPresentation('Cube', 'entity'), firstIdentity);
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		const first = presentationMessage(surface.messages[0]);

		lifecycle.update(readyPresentation('Intermediate', 'entity'), secondIdentity);
		lifecycle.update(readyPresentation('Crate', 'transform'), secondIdentity);
		assert.strictEqual(surface.messages.length, 1);
		lifecycle.acceptPresentationApplied('document-a', first.deliveryId);
		const latest = presentationMessage(surface.messages[1]);
		lifecycle.acceptPresentationApplied('document-a', latest.deliveryId);
		await settled();

		assert.deepStrictEqual(surface.messages.map(message => message.type === 'render'
			? [message.type, message.bootstrap.status === 'ready' ? message.bootstrap.snapshot.title : '']
			: [message.type]), [
			['render', 'Cube'],
			['render', 'Crate']
		]);
	});

	test('uses focus delivery only after the current content has been acknowledged', () => {
		const surface = new TestSurface();
		const lifecycle = new InspectorWebviewLifecycle(surface, identitySequence('document-a'));
		const identity = {};
		lifecycle.update(readyPresentation('Cube', 'entity'), identity);
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		const render = presentationMessage(surface.messages[0]);
		lifecycle.acceptPresentationApplied('document-a', render.deliveryId);

		lifecycle.update(readyPresentation('Cube', 'transform'), identity);

		assert.deepStrictEqual(surface.messages[1], {
			type: 'focusGroup', documentId: 'document-a', deliveryId: 2, groupId: 'transform'
		});
	});

	test('rejects obsolete readiness and acknowledgement after document replacement', () => {
		const surface = new TestSurface();
		const lifecycle = new InspectorWebviewLifecycle(
			surface, identitySequence('document-a', 'document-b'));
		lifecycle.update(readyPresentation('Cube', 'entity'), {});
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		const obsoleteDelivery = presentationMessage(surface.messages[0]);

		lifecycle.deactivate();
		lifecycle.update(readyPresentation('Crate', 'entity'), {});
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		lifecycle.acceptPresentationApplied('document-a', obsoleteDelivery.deliveryId);
		assert.strictEqual(surface.messages.length, 1);
		lifecycle.acceptReady('document-b');

		assert.deepStrictEqual(surface.documents, ['document-a', 'document-b']);
		assert.strictEqual(readyRenderTitle(surface.messages[1]), 'Crate');
	});

	test('retains failed delivery for the next readiness boundary without retrying in a loop', async () => {
		const surface = new TestSurface();
		surface.deliveries.push(false, true);
		const lifecycle = new InspectorWebviewLifecycle(surface, identitySequence('document-a'));
		lifecycle.update(emptyPresentation('Latest'), undefined);
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		await settled();
		assert.strictEqual(surface.messages.length, 1);

		lifecycle.acceptReady('document-a');
		await settled();

		assert.deepStrictEqual(surface.messages.map(renderLabel), ['Latest', 'Latest']);
	});

	test('does not repeat an acknowledged presentation for duplicate readiness', () => {
		const surface = new TestSurface();
		const lifecycle = new InspectorWebviewLifecycle(surface, identitySequence('document-a'));
		lifecycle.update(emptyPresentation('Inspector'), undefined);
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		const delivery = presentationMessage(surface.messages[0]);
		lifecycle.acceptPresentationApplied('document-a', delivery.deliveryId);
		lifecycle.acceptReady('document-a');

		assert.strictEqual(surface.messages.length, 1);
	});

	test('settles close preparation against its owning document and rejects late responses', async () => {
		const surface = new TestSurface();
		const lifecycle = new InspectorWebviewLifecycle(
			surface, identitySequence('document-a', 'document-b'));
		lifecycle.update(emptyPresentation('Inspector'), undefined);
		lifecycle.activate();
		lifecycle.acceptReady('document-a');
		const delivery = presentationMessage(surface.messages[0]);
		lifecycle.acceptPresentationApplied('document-a', delivery.deliveryId);

		const close = lifecycle.prepareForDocumentClose();
		const request = surface.messages[1];
		assert.strictEqual(request.type, 'prepareForDocumentClose');
		lifecycle.deactivate();
		assert.strictEqual(await close, false);
		lifecycle.activate();
		lifecycle.acceptReady('document-b');
		const currentDelivery = presentationMessage(surface.messages[2]);
		lifecycle.acceptPresentationApplied('document-b', currentDelivery.deliveryId);
		if (request.type === 'prepareForDocumentClose') {
			lifecycle.acceptCloseResult('document-a', request.requestId, true);
		}
		const currentClose = lifecycle.prepareForDocumentClose();
		const currentRequest = surface.messages[3];
		assert.strictEqual(currentRequest.type, 'prepareForDocumentClose');
		if (currentRequest.type === 'prepareForDocumentClose') {
			lifecycle.acceptCloseResult('document-b', currentRequest.requestId, true);
		}
		assert.strictEqual(await currentClose, true);
	});

	test('ignores readiness after disposal and leaves no active document', () => {
		const surface = new TestSurface();
		const lifecycle = new InspectorWebviewLifecycle(surface, identitySequence('document-a'));
		lifecycle.update(emptyPresentation('Inspector'), undefined);
		lifecycle.activate();
		lifecycle.dispose();
		lifecycle.acceptReady('document-a');

		assert.deepStrictEqual(surface.messages, []);
		assert.strictEqual(lifecycle.isCurrentDocument('document-a'), false);
	});
});

class TestSurface implements InspectorWebviewLifecycleSurface {
	readonly documents: string[] = [];
	readonly messages: InspectorHostToWebviewMessage[] = [];
	readonly deliveries: boolean[] = [];

	initializeDocument(documentId: string): void {
		this.documents.push(documentId);
	}

	postMessage(message: InspectorHostToWebviewMessage): PromiseLike<boolean> {
		this.messages.push(message);
		return Promise.resolve(this.deliveries.shift() ?? true);
	}
}

function identitySequence(...identities: readonly string[]): () => string {
	let index = 0;
	return () => identities[index++] ?? `document-${index}`;
}

function emptyPresentation(label: string): InspectorPresentation {
	return {
		status: 'empty',
		strings: {
			inspector: 'Inspector', empty: label, emptyDetail: '', loading: '', rejected: '', readOnly: '',
			entityName: '', enabled: '', static: '', tag: '', untagged: '', layer: '', defaultLayer: '',
			deferred: '', componentHelp: '', componentSettings: '', componentActions: '', addComponent: '',
			chooseResource: '', unset: '', required: '', broken: '', metadataUnavailable: '', resolved: '',
			trueValue: '', falseValue: '', invalidInteger: '', invalidNumber: '', modified: '', items: '', fields: ''
		}
	};
}

function readyPresentation(title: string, selectedGroupId: string): InspectorPresentation {
	return {
		status: 'ready', selectedGroupId, strings: emptyPresentation('').strings,
		snapshot: {
			revision: 1,
			target: { kind: 'local-entity', source: 'file:///scene.json', identity: title, occurrence: null },
			title, definitionOrigin: 'authored', provenance: 'local', editable: true,
			groups: [
				{
					identity: 'entity', kind: 'entity', label: 'Entity', description: null,
					componentId: null, componentType: null, metadataStatus: 'available', editable: true, properties: []
				},
				{
					identity: 'transform', kind: 'component', label: 'Transform', description: null,
					componentId: 'transform', componentType: null, metadataStatus: 'available', editable: true, properties: []
				}
			]
		}
	};
}

function renderLabel(message: InspectorHostToWebviewMessage): string {
	assert.strictEqual(message.type, 'render');
	return message.bootstrap.strings.empty;
}

function readyRenderTitle(message: InspectorHostToWebviewMessage): string {
	assert.strictEqual(message.type, 'render');
	assert.strictEqual(message.bootstrap.status, 'ready');
	return message.bootstrap.snapshot.title;
}

function presentationMessage(message: InspectorHostToWebviewMessage): Extract<
	InspectorHostToWebviewMessage, { readonly type: 'render' | 'focusGroup' }
> {
	if (message.type !== 'render' && message.type !== 'focusGroup') {
		throw new Error('Expected an Inspector presentation delivery');
	}
	return message;
}

async function settled(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
