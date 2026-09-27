/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { definitionResourceKey, definitionResourceUri } from '../definition/definitionResource';
import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D definition resources', () => {
	test('distinguishes Java service lifetimes when the numeric project generation resets', () => {
		const resourceA = resourceForConnection('connection-a');
		const resourceB = resourceForConnection('connection-b');

		assert.notStrictEqual(resourceA, resourceB);
	});

	test('retains authored source URI while scoping the editor resource by generation and AssetId', () => {
		const resource = new URL(definitionResourceUri('connection-a', 7, definition('authored')));

		assert.strictEqual(resource.protocol, 'file:');
		assert.strictEqual(resource.pathname, '/projects/game/worlds/main.world.json');
		assert.strictEqual(resource.searchParams.get('jscene3dConnectionGeneration'), 'connection-a');
		assert.strictEqual(resource.searchParams.get('jscene3dGeneration'), '7');
		assert.strictEqual(resource.searchParams.get('jscene3dAssetId'), 'definition-a');
	});

	test('uses a JScene3D-owned virtual resource for generated definitions', () => {
		const resource = new URL(definitionResourceUri('connection-a', 8, definition('generated')));

		assert.strictEqual(resource.protocol, 'jscene3d-definition:');
		assert.strictEqual(resource.hostname, 'generated');
		assert.match(resource.pathname, /definition-a\.world\.json$/);
		assert.strictEqual(resource.searchParams.get('jscene3dConnectionGeneration'), 'connection-a');
		assert.strictEqual(resource.searchParams.get('jscene3dGeneration'), '8');
	});

	test('maps every current definition kind to an explicit generated suffix', () => {
		const world = new URL(definitionResourceUri('connection-a', 8, definition('generated', 'world-definition')));
		const entity = new URL(definitionResourceUri('connection-a', 8, definition('generated', 'entity-definition')));

		assert.match(world.pathname, /definition-a\.world\.json$/);
		assert.match(entity.pathname, /definition-a\.entity\.json$/);
	});

	test('keeps one complete authored-definition identity stable', () => {
		const resourceA = definitionResourceUri('connection-a', 7, definition('authored'));
		const resourceB = definitionResourceUri('connection-a', 7, definition('authored'));

		assert.strictEqual(resourceA, resourceB);
	});

	test('distinguishes numeric project generations within one Java connection', () => {
		const resourceA = definitionResourceUri('connection-a', 7, definition('authored'));
		const resourceB = definitionResourceUri('connection-a', 8, definition('authored'));

		assert.notStrictEqual(resourceA, resourceB);
	});

	test('distinguishes AssetIds within one connection and project generation', () => {
		const resourceA = definitionResourceUri('connection-a', 7, definition('authored', 'world-definition', 'definition-a'));
		const resourceB = definitionResourceUri('connection-a', 7, definition('authored', 'world-definition', 'definition-b'));

		assert.notStrictEqual(resourceA, resourceB);
	});

	test('rejects an absent Java connection generation', () => {
		assert.throws(() => definitionResourceUri('', 7, definition('authored')), /must not be empty/);
	});

	test('uses the unencoded Code OSS URI form for resource-state lookup', () => {
		const raw = 'file:///projects/game/worlds/main.world.json?generation=1';
		const encoded = 'file:///projects/game/worlds/main.world.json?generation%3D1';
		const calls: Array<boolean | undefined> = [];

		const key = definitionResourceKey({
			toString: (skipEncoding?: boolean) => {
				calls.push(skipEncoding);
				return skipEncoding ? raw : encoded;
			}
		});

		assert.strictEqual(key, raw);
		assert.deepStrictEqual(calls, [true]);
	});
});

function resourceForConnection(connectionGeneration: string): string {
	return definitionResourceUri(connectionGeneration, 1, definition('authored'));
}

function definition(
	origin: 'authored' | 'generated',
	kind: DefinitionSnapshotDto['context']['kind'] = 'world-definition',
	assetId = 'definition-a'
): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId,
			kind,
			origin,
			editable: origin === 'authored',
			source: 'file:///projects/game/worlds/main.world.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: []
	};
}
