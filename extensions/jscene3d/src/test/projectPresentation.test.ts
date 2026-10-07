/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import {
	ProjectPresentation,
	ProjectPresentationActivation,
	ProjectPresentationActivationHost,
	ProjectPresentationDocument,
	ProjectPresentationDocumentSurface,
	ProjectPresentationHost,
	ProjectPresentationLifecycle,
	projectPresentation,
	projectPresentationContent,
	projectVisibility,
	shouldRevealStartupPresentation
} from '../project/projectPresentation';
import { ProjectSnapshot } from '../project/projectState';

suite('JScene3D Project presentation', () => {
	test('maps no-Project, loading, ready, and failure into deliberate central states', () => {
		assert.deepStrictEqual(projectPresentation(closedSnapshot()), { status: 'welcome' });
		assert.deepStrictEqual(projectPresentation({
			status: 'opening', candidatePath: '/projects/editor-sandbox.j3d',
			activeDiagnostics: [], attemptDiagnostics: []
		}), { status: 'loading', projectName: 'editor-sandbox', phase: 'opening' });
		assert.deepStrictEqual(projectPresentation({
			...openSnapshot(7), status: 'replacing', candidatePath: '/projects/next/next.j3d'
		}), { status: 'loading', projectName: 'next', phase: 'opening' });
		assert.deepStrictEqual(projectPresentation(openSnapshot(7)), { status: 'ready' });
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
		await lifecycle.synchronize(openSnapshot(7));

		assert.deepStrictEqual(host.presentations, [
			{ status: 'welcome' },
			{ status: 'loading', projectName: 'sandbox', phase: 'opening' },
			{ status: 'ready' }
		]);
	});

	test('prevents an obsolete loading presentation from completing after ready', async () => {
		const host = new DelayedPresentationHost();
		const lifecycle = new ProjectPresentationLifecycle(host, new TestLogger());

		const loading = lifecycle.synchronize({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		});
		await host.loadingStarted;
		const ready = lifecycle.synchronize(openSnapshot(7));
		host.completeLoading();
		await Promise.all([loading, ready]);

		assert.deepStrictEqual({
			visible: host.visible,
			maximumConcurrentShows: host.maximumConcurrentShows
		}, {
			visible: { status: 'ready' },
			maximumConcurrentShows: 1
		});
	});

	test('uses the same ordered presentation path when replacing a Project', async () => {
		const host = new DelayedPresentationHost();
		const lifecycle = new ProjectPresentationLifecycle(host, new TestLogger());

		await lifecycle.synchronize(openSnapshot(7));
		const loading = lifecycle.synchronize({
			...openSnapshot(7), status: 'replacing', candidatePath: '/projects/next.j3d'
		});
		await host.loadingStarted;
		const ready = lifecycle.synchronize(openSnapshot(8));
		host.completeLoading();
		await Promise.all([loading, ready]);

		assert.deepStrictEqual({
			presentations: host.presentations,
			visible: host.visible,
			maximumConcurrentShows: host.maximumConcurrentShows
		}, {
			presentations: [
				{ status: 'ready' },
				{ status: 'loading', projectName: 'next', phase: 'opening' },
				{ status: 'ready' }
			],
			visible: { status: 'ready' },
			maximumConcurrentShows: 1
		});
	});

	test('withholds Project views and definition context until the Project is ready', () => {
		assert.deepStrictEqual(projectVisibility({
			status: 'opening', candidatePath: '/projects/sandbox.j3d', activeDiagnostics: [], attemptDiagnostics: []
		}), { open: false, busy: true, definitionGeneration: undefined });
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
		const loading = projectPresentationContent(
			{ status: 'loading', projectName: 'Sandbox', phase: 'opening' }, translate);
		const ready = projectPresentationContent({ status: 'ready' }, translate);
		const failed = projectPresentationContent({ status: 'failed', failure: '<invalid>' }, translate);

		assert.match(loading, /Opening Project/);
		assert.match(loading, />Sandbox</);
		assert.match(loading, /role="status"/);
		assert.match(ready, /Open a Scene or Entity to start editing/);
		assert.match(ready, /class="ready" role="status"/);
		assert.doesNotMatch(ready, /Sandbox|is open|Scenes|Entity Definitions|class="mark"/);
		assert.match(failed, /role="alert"/);
		assert.match(failed, /&lt;invalid&gt;/);
		assert.doesNotMatch(`${loading}${ready}${failed}`, /Drag a view here to display/);
	});

	test('updates loading to ready in one persistent Project presentation document', async () => {
		const surface = new TestPresentationDocumentSurface();
		const document = new ProjectPresentationDocument(
			surface,
			{ status: 'loading', projectName: 'Sandbox', phase: 'opening' },
			identityTranslation,
			'test-nonce'
		);

		await document.update({ status: 'ready' });
		assert.strictEqual(surface.messages.length, 0);
		await document.acceptReady({ type: 'jscene3d.projectPresentation.ready', revision: 1 });

		assert.strictEqual(surface.documents.length, 1);
		assert.match(surface.documents[0], /Opening Project/);
		assert.match(surface.documents[0], /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{/);
		assert.deepStrictEqual(surface.messages.map(message => ({
			revision: message.revision,
			content: message.content
		})), [{
			revision: 2,
			content: projectPresentationContent({ status: 'ready' }, identityTranslation)
		}]);
		assert.match(surface.messages[0].content, /Open a Scene or Entity to start editing/);
	});

	test('keeps pending activation inactive when reveal fails', async () => {
		const host = new FailingPresentationActivationHost();
		const activation = new ProjectPresentationActivation(host);

		await assert.rejects(() => activation.acceptRenderedReady(false), /reveal failed/);

		assert.deepStrictEqual({ active: activation.active, events: host.events }, {
			active: false,
			events: ['reveal']
		});
	});

	test('keeps the same Project presentation document through Project replacement', async () => {
		const surface = new TestPresentationDocumentSurface();
		const document = new ProjectPresentationDocument(
			surface,
			{ status: 'ready' },
			identityTranslation,
			'test-nonce'
		);
		await document.acceptReady({ type: 'jscene3d.projectPresentation.ready', revision: 1 });

		await document.update({ status: 'loading', projectName: 'Next', phase: 'opening' });
		await document.update({ status: 'ready' });

		assert.strictEqual(surface.documents.length, 1);
		assert.deepStrictEqual(surface.messages.map(message => message.revision), [2, 3]);
		assert.match(surface.messages[0].content, /Opening Project/);
		assert.match(surface.messages[1].content, /Open a Scene or Entity to start editing/);
		assert.doesNotMatch(surface.messages.map(message => message.content).join(''), /JScene3D Welcome/);
	});

	test('reveals a pending Project editor only after rendered readiness', async () => {
		const host = new TestPresentationActivationHost();
		const activation = new ProjectPresentationActivation(host);

		assert.deepStrictEqual({ active: activation.active, events: host.events }, {
			active: false,
			events: []
		});

		await activation.acceptRenderedReady(true);
		await activation.acceptRenderedReady(true);

		assert.deepStrictEqual({ active: activation.active, events: host.events }, {
			active: true,
			events: ['reveal', 'closeWelcome', 'completeStartupPresentation:true']
		});
	});

	test('does not activate a disposed pending Project editor from stale readiness', async () => {
		const host = new TestPresentationActivationHost();
		const activation = new ProjectPresentationActivation(host);

		activation.dispose();
		await activation.acceptRenderedReady(false);

		assert.deepStrictEqual({ active: activation.active, events: host.events }, {
			active: false,
			events: []
		});
	});

	test('keeps automatic reopen loading behind startup coverage until a terminal presentation exists', () => {
		assert.strictEqual(shouldRevealStartupPresentation({
			status: 'loading', projectName: 'Sandbox', phase: 'opening'
		}), false);
		assert.strictEqual(shouldRevealStartupPresentation({
			status: 'ready'
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

class TestPresentationActivationHost implements ProjectPresentationActivationHost {
	readonly events: string[] = [];

	reveal(): void {
		this.events.push('reveal');
	}

	closeWelcome(): Promise<void> {
		this.events.push('closeWelcome');
		return Promise.resolve();
	}

	completeStartupPresentation(revealApplicationSplash: boolean): Promise<void> {
		this.events.push(`completeStartupPresentation:${revealApplicationSplash}`);
		return Promise.resolve();
	}
}

class FailingPresentationActivationHost extends TestPresentationActivationHost {
	override reveal(): void {
		super.reveal();
		throw new Error('reveal failed');
	}
}

class DelayedPresentationHost implements ProjectPresentationHost {
	private readonly loadingGate = deferred<void>();
	private readonly loadingStartedGate = deferred<void>();
	private concurrentShows = 0;
	readonly presentations: ProjectPresentation[] = [];
	visible: ProjectPresentation | undefined;
	maximumConcurrentShows = 0;
	readonly loadingStarted = this.loadingStartedGate.promise;

	async show(presentation: ProjectPresentation): Promise<void> {
		this.concurrentShows++;
		this.maximumConcurrentShows = Math.max(this.maximumConcurrentShows, this.concurrentShows);
		if (presentation.status === 'loading') {
			this.loadingStartedGate.resolve();
			await this.loadingGate.promise;
		}
		this.visible = presentation;
		this.presentations.push(presentation);
		this.concurrentShows--;
	}

	completeLoading(): void {
		this.loadingGate.resolve();
	}
}

class TestLogger {
	appendLine(_message: string): void { }
}

class TestPresentationDocumentSurface implements ProjectPresentationDocumentSurface {
	readonly documents: string[] = [];
	readonly messages: import('../project/projectPresentation').ProjectPresentationUpdate[] = [];

	initializeDocument(html: string): void {
		this.documents.push(html);
	}

	postMessage(message: import('../project/projectPresentation').ProjectPresentationUpdate): PromiseLike<boolean> {
		this.messages.push(message);
		return Promise.resolve(true);
	}
}

function identityTranslation(message: string): string {
	return message;
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
	let resolvePromise: (value: T) => void = () => { };
	const promise = new Promise<T>(resolve => resolvePromise = resolve);
	return { promise, resolve: value => resolvePromise(value) };
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
