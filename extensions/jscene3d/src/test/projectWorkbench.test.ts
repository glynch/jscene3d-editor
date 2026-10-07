/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import {
	ProjectWorkbenchHost,
	ProjectWorkbenchLifecycle,
	ProjectWorkbenchPresentation,
	projectVisibility,
	projectWorkbenchPresentation
} from '../project/projectWorkbench';
import { ProjectSnapshot } from '../project/projectState';

suite('JScene3D Project workbench', () => {
	test('maps Project lifecycle into Welcome, transition, and tabless ready states', () => {
		assert.deepStrictEqual(projectWorkbenchPresentation(closedSnapshot()), { status: 'welcome' });
		assert.deepStrictEqual(projectWorkbenchPresentation({
			status: 'opening', candidatePath: '/projects/editor-sandbox.j3d',
			activeDiagnostics: [], attemptDiagnostics: []
		}), { status: 'transition' });
		assert.deepStrictEqual(projectWorkbenchPresentation(openSnapshot(7)), {
			status: 'ready', projectName: 'JScene3D Editor Sandbox'
		});
		assert.deepStrictEqual(projectWorkbenchPresentation({
			status: 'openFailed', failure: 'project.invalid', activeDiagnostics: [], attemptDiagnostics: []
		}), { status: 'welcome' });
	});

	test('deduplicates identical workbench states without creating editor identities', async () => {
		const host = new TestWorkbenchHost();
		const lifecycle = new ProjectWorkbenchLifecycle(host, new TestLogger());

		await lifecycle.synchronize(closedSnapshot());
		await lifecycle.synchronize(closedSnapshot());
		await lifecycle.synchronize({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		});
		await lifecycle.synchronize(openSnapshot(7));

		assert.deepStrictEqual(host.presentations, [
			{ status: 'welcome' },
			{ status: 'transition' },
			{ status: 'ready', projectName: 'JScene3D Editor Sandbox' }
		]);
	});

	test('prevents an obsolete transition from replacing the ready empty-editor state', async () => {
		const host = new DelayedWorkbenchHost();
		const lifecycle = new ProjectWorkbenchLifecycle(host, new TestLogger());

		const transitioning = lifecycle.synchronize({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		});
		await host.transitionStarted;
		const ready = lifecycle.synchronize(openSnapshot(7));
		host.completeTransition();
		await Promise.all([transitioning, ready]);

		assert.deepStrictEqual({ visible: host.visible, maximumConcurrentShows: host.maximumConcurrentShows }, {
			visible: { status: 'ready', projectName: 'JScene3D Editor Sandbox' },
			maximumConcurrentShows: 1
		});
	});

	test('withholds Project views and definition context until the Project is ready', () => {
		assert.deepStrictEqual(projectVisibility({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		}), { open: false, busy: true, definitionGeneration: undefined });
		assert.deepStrictEqual(projectVisibility(openSnapshot(7)), {
			open: true,
			busy: false,
			definitionGeneration: 7
		});
	});
});

class TestWorkbenchHost implements ProjectWorkbenchHost {
	readonly presentations: ProjectWorkbenchPresentation[] = [];

	show(presentation: ProjectWorkbenchPresentation): Promise<void> {
		this.presentations.push(presentation);
		return Promise.resolve();
	}
}

class DelayedWorkbenchHost implements ProjectWorkbenchHost {
	private readonly transitionGate = deferred<void>();
	private readonly transitionStartedGate = deferred<void>();
	private concurrentShows = 0;
	visible: ProjectWorkbenchPresentation | undefined;
	maximumConcurrentShows = 0;
	readonly transitionStarted = this.transitionStartedGate.promise;

	async show(presentation: ProjectWorkbenchPresentation): Promise<void> {
		this.concurrentShows++;
		this.maximumConcurrentShows = Math.max(this.maximumConcurrentShows, this.concurrentShows);
		if (presentation.status === 'transition') {
			this.transitionStartedGate.resolve();
			await this.transitionGate.promise;
		}
		this.visible = presentation;
		this.concurrentShows--;
	}

	completeTransition(): void {
		this.transitionGate.resolve();
	}
}

class TestLogger {
	appendLine(_message: string): void { }
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value?: T): void } {
	let resolvePromise: (value: T | PromiseLike<T>) => void = () => { };
	const promise = new Promise<T>(resolve => resolvePromise = resolve);
	return { promise, resolve: value => resolvePromise(value as T) };
}

function closedSnapshot(): ProjectSnapshot {
	return { status: 'closed', activeDiagnostics: [], attemptDiagnostics: [] };
}

function openSnapshot(generation: number): ProjectSnapshot & { readonly status: 'open'; readonly generation: number } {
	return { status: 'open', generation, project, activeDiagnostics: [], attemptDiagnostics: [] };
}

const project: ProjectSummaryDto = {
	id: 'sandbox',
	name: 'JScene3D Editor Sandbox',
	version: '0.1.0-SNAPSHOT',
	root: '/projects/sandbox',
	descriptor: '/projects/sandbox/sandbox.j3d',
	mainScene: null,
	assetCounts: { authored: 0, projected: 0 },
	catalog: { scenes: [], entityDefinitions: [] }
};
