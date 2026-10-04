/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import {
	ProjectPresentation,
	ProjectPresentationHost,
	ProjectPresentationLifecycle,
	projectPresentation,
	projectPresentationHtml,
	projectVisibility,
	shouldRevealStartupPresentation
} from '../project/projectPresentation';
import { ProjectSnapshot } from '../project/projectState';

suite('JScene3D Project presentation', () => {
	test('maps no-Project, loading, preparation, ready, and failure into deliberate central states', () => {
		assert.deepStrictEqual(projectPresentation(closedSnapshot()), { status: 'welcome' });
		assert.deepStrictEqual(projectPresentation({
			status: 'opening', candidatePath: '/projects/editor-sandbox.j3d',
			activeDiagnostics: [], attemptDiagnostics: []
		}), { status: 'loading', projectName: 'editor-sandbox', phase: 'opening' });
		assert.deepStrictEqual(projectPresentation({
			...openSnapshot(7), status: 'replacing', candidatePath: '/projects/next/next.j3d'
		}), { status: 'loading', projectName: 'next', phase: 'opening' });
		assert.deepStrictEqual(projectPresentation({
			...openSnapshot(7), status: 'preparingWorkspace'
		}), { status: 'loading', projectName: 'JScene3D Editor Sandbox', phase: 'opening' });
		assert.deepStrictEqual(projectPresentation(openSnapshot(7)), {
			status: 'ready', projectName: 'JScene3D Editor Sandbox', sceneCount: 2, entityDefinitionCount: 1
		});
		assert.deepStrictEqual(projectPresentation({
			status: 'openFailed', failure: 'project.invalid', activeDiagnostics: [], attemptDiagnostics: []
		}), { status: 'failed', failure: 'project.invalid' });
	});

	test('deduplicates identical presentations while preserving state changes', async () => {
		const host = new TestPresentationHost();
		const lifecycle = new ProjectPresentationLifecycle(host, new TestLogger());

		await lifecycle.synchronize(closedSnapshot());
		await lifecycle.synchronize(closedSnapshot());
		await lifecycle.synchronize({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		});
		await lifecycle.synchronize({ ...openSnapshot(7), status: 'preparingWorkspace' });
		await lifecycle.synchronize(openSnapshot(7));

		assert.deepStrictEqual(host.presentations, [
			{ status: 'welcome' },
			{ status: 'loading', projectName: 'sandbox', phase: 'opening' },
			{ status: 'loading', projectName: 'JScene3D Editor Sandbox', phase: 'opening' },
			{ status: 'ready', projectName: 'JScene3D Editor Sandbox', sceneCount: 2, entityDefinitionCount: 1 }
		]);
	});

	test('withholds Project views and definition context until the Project is ready', () => {
		assert.deepStrictEqual(projectVisibility({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		}), { open: false, busy: true, definitionGeneration: undefined });
		assert.deepStrictEqual(projectVisibility({ ...openSnapshot(7), status: 'preparingWorkspace' }), {
			open: false, busy: true, definitionGeneration: undefined
		});
		assert.deepStrictEqual(projectVisibility({
			...openSnapshot(7), status: 'replacing', candidatePath: '/projects/next.j3d'
		}), { open: false, busy: true, definitionGeneration: undefined });
		assert.deepStrictEqual(projectVisibility(openSnapshot(7)), {
			open: true, busy: false, definitionGeneration: 7
		});
		assert.deepStrictEqual(projectVisibility({
			status: 'openFailed', failure: 'invalid', activeDiagnostics: [], attemptDiagnostics: []
		}), { open: false, busy: false, definitionGeneration: undefined });
	});

	test('renders loading, ready, and failure without generic workbench placeholders', () => {
		const translate = (message: string, ...args: string[]) => args.reduce(
			(value, argument, index) => value.replace(`{${index}}`, argument), message);
		const loading = projectPresentationHtml(
			{ status: 'loading', projectName: 'Sandbox', phase: 'opening' }, translate);
		const ready = projectPresentationHtml({
			status: 'ready', projectName: 'Sandbox', sceneCount: 2, entityDefinitionCount: 1
		}, translate);
		const failed = projectPresentationHtml({ status: 'failed', failure: '<invalid>' }, translate);

		assert.match(loading, /Opening Project/);
		assert.match(loading, />Sandbox</);
		assert.match(loading, /role="status"/);
		assert.match(ready, /Sandbox is open/);
		assert.match(ready, /No Scene is currently open/);
		assert.match(failed, /role="alert"/);
		assert.match(failed, /&lt;invalid&gt;/);
		assert.doesNotMatch(`${loading}${ready}${failed}`, /Drag a view here to display/);
	});

	test('keeps automatic reopen loading behind startup coverage until a terminal presentation exists', () => {
		assert.strictEqual(shouldRevealStartupPresentation({
			status: 'loading', projectName: 'Sandbox', phase: 'opening'
		}), false);
		assert.strictEqual(shouldRevealStartupPresentation({
			status: 'ready', projectName: 'Sandbox', sceneCount: 2, entityDefinitionCount: 1
		}), true);
		assert.strictEqual(shouldRevealStartupPresentation({ status: 'failed', failure: 'invalid' }), true);
		assert.strictEqual(shouldRevealStartupPresentation({ status: 'welcome' }), true);
	});
});

class TestPresentationHost implements ProjectPresentationHost {
	readonly presentations: ProjectPresentation[] = [];

	show(presentation: ProjectPresentation): Promise<void> {
		this.presentations.push(presentation);
		return Promise.resolve();
	}
}

class TestLogger {
	appendLine(_message: string): void { }
}

function closedSnapshot(): ProjectSnapshot {
	return { status: 'closed', activeDiagnostics: [], attemptDiagnostics: [] };
}

function openSnapshot(generation: number): ProjectSnapshot & { readonly status: 'open'; readonly generation: number } {
	return {
		status: 'open', generation, project, activeDiagnostics: [], attemptDiagnostics: []
	};
}

const project: ProjectSummaryDto = {
	id: 'sandbox',
	name: 'JScene3D Editor Sandbox',
	version: '0.1.0-SNAPSHOT',
	root: '/projects/sandbox',
	descriptor: '/projects/sandbox/sandbox.j3d',
	mainScene: null,
	assetCounts: { authored: 3, projected: 0 },
	catalog: {
		scenes: [
			{ id: 'main', name: 'Main', source: 'main.scene.json', origin: 'authored', editable: true, mainScene: true },
			{ id: 'second', name: 'Second', source: 'second.scene.json', origin: 'authored', editable: true, mainScene: false }
		],
		entityDefinitions: [
			{ id: 'crate', name: 'Crate', source: 'crate.entity.json', origin: 'authored', editable: true, mainScene: false }
		]
	}
};
