/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { definitionResourceKey, definitionResourceUri } from '../definition/definitionResource';
import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D definition resources', () => {
	test('retains authored source URI while scoping the editor resource by generation and AssetId', () => {
		const resource = new URL(definitionResourceUri(7, definition('authored')));

		assert.strictEqual(resource.protocol, 'file:');
		assert.strictEqual(resource.pathname, '/projects/game/worlds/main.world.json');
		assert.strictEqual(resource.searchParams.get('jscene3dGeneration'), '7');
		assert.strictEqual(resource.searchParams.get('jscene3dAssetId'), 'definition-a');
	});

	test('uses a JScene3D-owned virtual resource for generated definitions', () => {
		const resource = new URL(definitionResourceUri(8, definition('generated')));

		assert.strictEqual(resource.protocol, 'jscene3d-definition:');
		assert.strictEqual(resource.hostname, 'generated');
		assert.match(resource.pathname, /definition-a\.world\.json$/);
		assert.strictEqual(resource.searchParams.get('jscene3dGeneration'), '8');
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

function definition(origin: 'authored' | 'generated'): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId: 'definition-a',
			kind: 'world-definition',
			origin,
			editable: origin === 'authored',
			source: 'file:///projects/game/worlds/main.world.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: []
	};
}
