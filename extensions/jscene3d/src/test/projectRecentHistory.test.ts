/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import { ProjectRecentHistory, ProjectRecentHistoryStore } from '../project/projectRecentHistory';
import { ProjectSessionResource, ProjectSessionResources } from '../project/projectSessionLifecycle';

suite('JScene3D recent Project history', () => {
	test('records only successful .j3d Project identity independently of workspace history', async () => {
		const store = new TestHistoryStore();
		let now = 1_000;
		const history = new ProjectRecentHistory(store, new TestResources(), '/Users/developer', () => now, 3);

		await history.record(projectA);
		now = 2_000;
		await history.record(projectB);
		now = 3_000;
		await history.record({
			...projectA,
			name: 'Project A Renamed',
			root: '/Users/developer/projects/moved-a',
			descriptor: '/Users/developer/projects/moved-a/moved-a.j3d'
		});

		assert.deepStrictEqual(history.entries(), [
			{
				projectId: 'project-a',
				name: 'Project A Renamed',
				descriptorUri: 'file:///Users/developer/projects/moved-a/moved-a.j3d',
				compactPath: '~/projects/moved-a',
				lastOpenedAt: 3_000
			},
			{
				projectId: 'project-b',
				name: 'Project B',
				descriptorUri: 'file:///outside/project-b/project-b.j3d',
				compactPath: '/outside/project-b',
				lastOpenedAt: 2_000
			}
		]);
		assert.strictEqual(JSON.stringify(store.value).includes('workspace'), false);
	});

	test('ignores malformed and non-Project persisted history entries', () => {
		const store = new TestHistoryStore();
		store.value = {
			version: 1,
			projects: [
				{
					projectId: 'not-a-project', name: 'Notes', descriptorUri: 'file:///tmp/notes.txt',
					compactPath: '/tmp', lastOpenedAt: 2_000
				},
				{
					projectId: 'project-a', name: 'Project A', descriptorUri: 'file:///projects/a/a.j3d',
					compactPath: '/projects/a', lastOpenedAt: 1_000
				}
			]
		};

		const history = new ProjectRecentHistory(store, new TestResources(), '/Users/developer');

		assert.deepStrictEqual(history.entries().map(entry => entry.projectId), ['project-a']);
	});
});

class TestHistoryStore implements ProjectRecentHistoryStore {
	value: unknown;

	read(): unknown {
		return this.value;
	}

	write(value: unknown): Promise<void> {
		this.value = value;
		return Promise.resolve();
	}
}

class TestResources implements ProjectSessionResources {
	resourceForLocalPath(fsPath: string): ProjectSessionResource {
		return { uri: `file://${fsPath}`, fsPath };
	}

	parseLocalResource(uri: string): ProjectSessionResource | undefined {
		return uri.startsWith('file://') ? { uri, fsPath: uri.slice('file://'.length) } : undefined;
	}
}

const projectA: ProjectSummaryDto = {
	id: 'project-a',
	name: 'Project A',
	version: '1.0.0',
	root: '/Users/developer/projects/a',
	descriptor: '/Users/developer/projects/a/a.j3d',
	mainScene: null,
	assetCounts: { authored: 0, projected: 0 },
	catalog: { scenes: [], entityDefinitions: [] }
};

const projectB: ProjectSummaryDto = {
	...projectA,
	id: 'project-b',
	name: 'Project B',
	root: '/outside/project-b',
	descriptor: '/outside/project-b/project-b.j3d'
};
