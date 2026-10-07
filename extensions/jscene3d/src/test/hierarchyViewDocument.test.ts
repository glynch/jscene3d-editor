/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	HierarchyViewDocument,
	HierarchyViewDocumentSurface,
	HierarchyViewUpdate
} from '../hierarchy/hierarchyViewDocument';

suite('JScene3D Hierarchy view document', () => {
	test('keeps one search control while filtering to and from an empty query', () => {
		const surface = new TestSurface();
		const document = new HierarchyViewDocument(
			surface, '<p>Initial</p>', undefined, false, '', 'Search Entities...', 'Add Entity', 'nonce');

		document.acceptReady();
		document.update('<p>Cube</p>', undefined, true);
		document.update('<p>All entities</p>', undefined, false);

		assert.strictEqual(surface.documents.length, 1);
		assert.strictEqual(surface.documents[0].match(/id="search"/g)?.length, 1);
		assert.match(surface.documents[0], /content\.innerHTML = message\.content/);
		assert.doesNotMatch(surface.documents[0], /search\.value\s*=/);
		assert.deepStrictEqual(surface.messages.map(message => ({
			content: message.content,
			filtering: message.filtering
		})), [
			{ content: '<p>Initial</p>', filtering: false },
			{ content: '<p>Cube</p>', filtering: true },
			{ content: '<p>All entities</p>', filtering: false }
		]);
	});

	test('publishes only the latest pre-ready hierarchy state', () => {
		const surface = new TestSurface();
		const document = new HierarchyViewDocument(
			surface, '<p>Initial</p>', undefined, false, 'c', 'Search Entities...', 'Add Entity', 'nonce');

		document.update('<p>Cube</p>', 'scene/cube', true);
		document.acceptReady();

		assert.deepStrictEqual(surface.messages.map(message => ({
			content: message.content,
			selected: message.selected,
			filtering: message.filtering
		})), [{ content: '<p>Cube</p>', selected: 'scene/cube', filtering: true }]);
	});
});

class TestSurface implements HierarchyViewDocumentSurface {
	readonly documents: string[] = [];
	readonly messages: HierarchyViewUpdate[] = [];

	initializeDocument(html: string): void {
		this.documents.push(html);
	}

	postMessage(message: HierarchyViewUpdate): PromiseLike<boolean> {
		this.messages.push(message);
		return Promise.resolve(true);
	}
}
