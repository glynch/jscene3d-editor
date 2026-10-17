/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isInspectorWebviewMessage } from '../inspector/inspectorWebviewProtocol';

suite('JScene3D Inspector webview protocol', () => {
	test('accepts every supported webview-to-host message', () => {
		const nullPrototypeSelection = Object.assign(Object.create(null) as Record<string, unknown>, {
			type: 'selectGroup', documentId: 'document-a', groupId: 'movement'
		});

		assert.deepStrictEqual([
			{ type: 'ready', documentId: 'document-a' },
			{ type: 'presentationApplied', documentId: 'document-a', deliveryId: 1 },
			{ type: 'selectGroup', documentId: 'document-a', groupId: 'movement' },
			{
				type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed',
				candidate: { kind: 'number', literal: '1.25' }
			},
			{
				type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'count',
				candidate: { kind: 'integer', literal: '-2' }
			},
			{
				type: 'editProperty', documentId: 'document-a', groupId: 'entity', propertyId: 'enabled',
				candidate: { kind: 'boolean', value: false }
			},
			{
				type: 'editProperty', documentId: 'document-a', groupId: 'entity', propertyId: 'name',
				candidate: { kind: 'text', literal: 'Cube' }
			},
			{
				type: 'editProperty', documentId: 'document-a', groupId: 'transform', propertyId: 'position',
				candidate: { kind: 'number-array', literals: ['1', '2', '3'] }
			},
			{ type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 1, accepted: true },
			nullPrototypeSelection
		].map(isInspectorWebviewMessage), Array(10).fill(true));
	});

	test('rejects missing, unknown, malformed, and unexpected message shapes', () => {
		const prototypeProperty = JSON.parse(
			'{"type":"selectGroup","groupId":"movement","__proto__":{"polluted":true}}') as unknown;

		assert.deepStrictEqual([
			null,
			[],
			{},
			{ type: 'unknown' },
			{ type: 'ready' },
			{ type: 'ready', documentId: '' },
			{ type: 'ready', documentId: 'document-a', extra: true },
			{ type: 'presentationApplied', documentId: 'document-a', deliveryId: 0 },
			{ type: 'selectGroup', documentId: 'document-a' },
			{ type: 'selectGroup', documentId: 'document-a', groupId: '' },
			{ type: 'selectGroup', documentId: 'document-a', groupId: 1 },
			{ type: 'selectGroup', documentId: 'document-a', groupId: 'movement', extra: true },
			prototypeProperty,
			{ type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 0, accepted: true },
			{ type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 1.5, accepted: true },
			{ type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 1, accepted: 'true' },
			{ type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 1, accepted: true, extra: true },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed' },
			{ type: 'editProperty', documentId: 'document-a', groupId: '', propertyId: 'speed', candidate: { kind: 'number', literal: '1' } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: '', candidate: { kind: 'number', literal: '1' } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 2, candidate: { kind: 'number', literal: '1' } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed', candidate: null },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed', candidate: [] },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed', candidate: { kind: 'number', literal: 1 } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed', candidate: { kind: 'boolean', value: 'false' } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'position', candidate: { kind: 'number-array', literals: ['1', ['2']] } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed', candidate: { kind: 'number', literal: '1', extra: true } },
			{ type: 'editProperty', documentId: 'document-a', groupId: 'movement', propertyId: 'speed', candidate: { kind: 'unsupported', literal: '1' } }
		].map(isInspectorWebviewMessage), Array(28).fill(false));
	});
});
