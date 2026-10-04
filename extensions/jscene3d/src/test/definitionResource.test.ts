/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { definitionResourceKey, definitionResourceUri } from '../definition/definitionResource';
import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D definition resources', () => {
	test('distinguishes stable Project identities when source paths and AssetIds coincide', () => {
		const resourceA = resourceForProject('project-a');
		const resourceB = resourceForProject('project-b');

		assert.notStrictEqual(resourceA, resourceB);
	});

	test('retains authored source URI while scoping the editor resource by Project and AssetId', () => {
		const resource = new URL(definitionResourceUri('project-a', definition('authored')));

		assert.strictEqual(resource.protocol, 'file:');
		assert.strictEqual(resource.pathname, '/projects/game/worlds/main.scene.json');
		assert.strictEqual(resource.searchParams.get('jscene3dProjectId'), 'project-a');
		assert.strictEqual(resource.searchParams.get('jscene3dAssetId'), 'definition-a');
		assert.strictEqual(resource.searchParams.has('jscene3dGeneration'), false);
		assert.strictEqual(resource.searchParams.has('jscene3dConnectionGeneration'), false);
	});

	test('uses a JScene3D-owned virtual resource for generated definitions', () => {
		const resource = new URL(definitionResourceUri('project-a', definition('generated')));

		assert.strictEqual(resource.protocol, 'jscene3d-definition:');
		assert.strictEqual(resource.hostname, 'generated');
		assert.match(resource.pathname, /definition-a\.scene\.json$/);
		assert.strictEqual(resource.searchParams.get('jscene3dProjectId'), 'project-a');
	});

	test('maps every current definition kind to an explicit generated suffix', () => {
		const scene = new URL(definitionResourceUri('project-a', definition('generated', 'scene-definition')));
		const entity = new URL(definitionResourceUri('project-a', definition('generated', 'entity-definition')));

		assert.match(scene.pathname, /definition-a\.scene\.json$/);
		assert.match(entity.pathname, /definition-a\.entity\.json$/);
	});

	test('keeps one complete authored-definition identity stable', () => {
		const resourceA = definitionResourceUri('project-a', definition('authored'));
		const resourceB = definitionResourceUri('project-a', definition('authored'));

		assert.strictEqual(resourceA, resourceB);
	});

	test('does not encode transient Java connection or generation authority', () => {
		const resource = definitionResourceUri('project-a', definition('authored'));

		assert.doesNotMatch(resource, /ConnectionGeneration|Generation=/);
	});

	test('distinguishes AssetIds within one stable Project identity', () => {
		const resourceA = definitionResourceUri('project-a', definition('authored', 'scene-definition', 'definition-a'));
		const resourceB = definitionResourceUri('project-a', definition('authored', 'scene-definition', 'definition-b'));

		assert.notStrictEqual(resourceA, resourceB);
	});

	test('rejects an absent Project identity', () => {
		assert.throws(() => definitionResourceUri('', definition('authored')), /must not be empty/);
	});

	test('uses the unencoded Code OSS URI form for resource-state lookup', () => {
		const raw = 'file:///projects/game/worlds/main.scene.json?generation=1';
		const encoded = 'file:///projects/game/worlds/main.scene.json?generation%3D1';
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

function resourceForProject(projectId: string): string {
	return definitionResourceUri(projectId, definition('authored'));
}

function definition(
	origin: 'authored' | 'generated',
	kind: DefinitionSnapshotDto['context']['kind'] = 'scene-definition',
	assetId = 'definition-a'
): DefinitionSnapshotDto {
	return {
		revision: 0,
		context: {
			assetId,
			kind,
			origin,
			editable: origin === 'authored',
			source: 'file:///projects/game/worlds/main.scene.json',
			label: { kind: 'literal', text: 'World', messageCode: null, arguments: [] }
		},
		roots: []
	};
}
