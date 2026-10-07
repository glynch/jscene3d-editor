/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	ProjectLoadingMetadata,
	ProjectLoadingMetadataSource,
	ProjectLoadingSplashHost,
	ProjectLoadingSplashLifecycle,
	ProjectLoadingSplashScheduler,
	projectLoadingMetadata,
	projectLoadingSplashFadeDurationMs,
	projectLoadingSplashMinimumVisibleMs
} from '../project/projectLoadingSplash';
import { ProjectLocation } from '../project/projectLocation';

suite('JScene3D Project loading splash', () => {
	test('fast Project is shown immediately and remains until the minimum duration', async () => {
		const fixture = createFixture();
		const operation = fixture.lifecycle.begin(location('/projects/fast.j3d'));
		await settle();

		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project']);
		assert.deepStrictEqual(fixture.scheduler.delays, [projectLoadingSplashMinimumVisibleMs]);
		fixture.scheduler.advance(200);
		await operation.complete('success');
		await fixture.lifecycle.acceptProjectPresentationReady();
		fixture.scheduler.advance(1_799);
		await settle();
		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project']);

		fixture.scheduler.advance(1);
		await settle();
		assert.deepStrictEqual(fixture.host.events, [
			'show:1:Slow Project', `hide:1:${projectLoadingSplashFadeDurationMs}`
		]);
		assert.strictEqual(fixture.lifecycle.active, false);
	});

	test('medium Project remains visible until the minimum duration', async () => {
		const fixture = createFixture();
		const operation = fixture.lifecycle.begin(location('/projects/medium.j3d'));
		await settle();

		fixture.scheduler.advance(1_500);
		await operation.complete('success');
		await fixture.lifecycle.acceptProjectPresentationReady();
		fixture.scheduler.advance(499);
		await settle();
		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project']);

		fixture.scheduler.advance(1);
		await settle();
		assert.deepStrictEqual(fixture.host.events, [
			'show:1:Slow Project', `hide:1:${projectLoadingSplashFadeDurationMs}`
		]);
	});

	test('slow Project dismisses when readiness arrives after the minimum duration', async () => {
		const fixture = createFixture();
		const operation = fixture.lifecycle.begin(location('/projects/slow.j3d'));
		await settle();

		fixture.scheduler.advance(2_000);
		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project']);
		fixture.scheduler.advance(2_000);
		await operation.complete('success');
		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project']);

		await fixture.lifecycle.acceptProjectPresentationReady();
		assert.deepStrictEqual(fixture.host.events, [
			'show:1:Slow Project', `hide:1:${projectLoadingSplashFadeDurationMs}`
		]);
	});

	test('failure bypasses the minimum duration and removes the splash promptly', async () => {
		const fixture = createFixture();
		const operation = fixture.lifecycle.begin(location('/projects/failing.j3d'));
		await settle();

		fixture.scheduler.advance(200);
		await operation.complete('failure');

		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project', 'hide:1:0']);
		assert.strictEqual(fixture.lifecycle.active, false);
	});

	test('fade begins only after the terminal Project presentation is ready', async () => {
		const fixture = createFixture();
		const operation = fixture.lifecycle.begin(location('/projects/gated.j3d'));
		await settle();

		fixture.scheduler.advance(2_000);
		await operation.complete('success');
		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project']);

		await fixture.lifecycle.acceptProjectPresentationReady();
		assert.deepStrictEqual(fixture.host.events, [
			'show:1:Slow Project', `hide:1:${projectLoadingSplashFadeDurationMs}`
		]);
	});

	test('replacement and stale completion cannot dismiss the current Project splash', async () => {
		const fixture = createFixture();
		const obsolete = fixture.lifecycle.begin(location('/projects/obsolete.j3d'));
		await settle();
		fixture.scheduler.advance(500);
		const current = fixture.lifecycle.begin(location('/projects/current.j3d'));
		await settle();
		await obsolete.complete('success');
		fixture.scheduler.advance(1_999);
		await settle();

		assert.deepStrictEqual(fixture.host.events, [
			'show:1:Obsolete Project', 'hide:1:0', 'show:2:Current Project'
		]);
		fixture.scheduler.advance(1);
		await current.complete('success');
		await fixture.lifecycle.acceptProjectPresentationReady();
		assert.deepStrictEqual(fixture.host.events, [
			'show:1:Obsolete Project', 'hide:1:0', 'show:2:Current Project',
			`hide:2:${projectLoadingSplashFadeDurationMs}`
		]);
	});

	test('failure during asynchronous show removes the late overlay', async () => {
		const scheduler = new TestScheduler();
		const host = new DeferredShowHost();
		const lifecycle = new ProjectLoadingSplashLifecycle(
			{ read: async () => ({ name: 'Late Project', authors: [] }) },
			host,
			scheduler,
			new TestLogger()
		);
		const operation = lifecycle.begin(location('/projects/late.j3d'));

		await settle();
		await operation.complete('failure');
		host.completeShow();
		await settle();

		assert.deepStrictEqual(host.events, ['show:1:Late Project', 'hide:1:0']);
		assert.strictEqual(lifecycle.active, false);
	});

	test('disposal removes a visible splash without a fade', async () => {
		const fixture = createFixture();
		fixture.lifecycle.begin(location('/projects/disposed.j3d'));
		await settle();

		fixture.lifecycle.dispose();
		await settle();

		assert.deepStrictEqual(fixture.host.events, ['show:1:Slow Project', 'hide:1:0']);
		assert.strictEqual(fixture.lifecycle.active, false);
	});

	test('metadata failure falls back without blocking or cancelling Project loading', async () => {
		const fixture = createFixture({ read: () => Promise.reject(new Error('invalid descriptor')) });
		fixture.lifecycle.begin(location('/projects/fallback-name.j3d'));

		await settle();

		assert.deepStrictEqual(fixture.host.events, ['show:1:fallback-name']);
		assert.match(fixture.logger.lines[0], /invalid descriptor/);
	});

	test('extracts display identity while collapsing optional metadata', () => {
		assert.deepStrictEqual(projectLoadingMetadata({
			identity: {
				name: 'Doomed Corridors',
				version: '0.1.0-SNAPSHOT',
				description: 'An unofficial Doom-compatible first-person game.'
			},
			authors: [{ name: 'Graham Lynch' }, { name: 'JScene3D Team' }]
		}, 'fallback', 'file:///projects/doom/icon.png'), {
			name: 'Doomed Corridors',
			version: '0.1.0-SNAPSHOT',
			description: 'An unofficial Doom-compatible first-person game.',
			authors: ['Graham Lynch', 'JScene3D Team'],
			iconUri: 'file:///projects/doom/icon.png'
		});
		assert.deepStrictEqual(projectLoadingMetadata({
			identity: { name: 'Minimal Project', version: '1.0.0' }
		}, 'fallback', undefined), {
			name: 'Minimal Project', version: '1.0.0', description: undefined, authors: [], iconUri: undefined
		});
	});
});

function createFixture(metadataSource: ProjectLoadingMetadataSource = {
	read: async value => ({
		name: value.fsPath.includes('current') ? 'Current Project'
			: value.fsPath.includes('obsolete') ? 'Obsolete Project'
				: 'Slow Project',
		version: '1.0.0',
		authors: []
	})
}): {
	readonly lifecycle: ProjectLoadingSplashLifecycle;
	readonly scheduler: TestScheduler;
	readonly host: TestHost;
	readonly logger: TestLogger;
} {
	const scheduler = new TestScheduler();
	const host = new TestHost();
	const logger = new TestLogger();
	return {
		lifecycle: new ProjectLoadingSplashLifecycle(metadataSource, host, scheduler, logger),
		scheduler,
		host,
		logger
	};
}

class TestScheduler implements ProjectLoadingSplashScheduler {
	readonly delays: number[] = [];
	private currentTime = 0;
	private readonly tasks: {
		active: boolean;
		readonly callback: () => void;
		readonly dueAt: number;
	}[] = [];

	now(): number {
		return this.currentTime;
	}

	schedule(callback: () => void, delayMs: number): { dispose(): void } {
		this.delays.push(delayMs);
		const task = { active: true, callback, dueAt: this.currentTime + delayMs };
		this.tasks.push(task);
		return { dispose: () => task.active = false };
	}

	advance(durationMs: number): void {
		const targetTime = this.currentTime + durationMs;
		while (true) {
			const next = this.tasks
				.filter(task => task.active && task.dueAt <= targetTime)
				.sort((left, right) => left.dueAt - right.dueAt)[0];
			if (next === undefined) {
				break;
			}
			this.currentTime = next.dueAt;
			next.active = false;
			next.callback();
		}
		this.currentTime = targetTime;
	}
}

class TestHost implements ProjectLoadingSplashHost {
	readonly events: string[] = [];

	show(operationId: number, metadata: ProjectLoadingMetadata): Promise<void> {
		this.events.push(`show:${operationId}:${metadata.name}`);
		return Promise.resolve();
	}

	hide(operationId: number, fadeDurationMs: number): Promise<void> {
		this.events.push(`hide:${operationId}:${fadeDurationMs}`);
		return Promise.resolve();
	}
}

class DeferredShowHost extends TestHost {
	private readonly showGate = deferred<void>();

	override async show(operationId: number, metadata: ProjectLoadingMetadata): Promise<void> {
		void super.show(operationId, metadata);
		await this.showGate.promise;
	}

	completeShow(): void {
		this.showGate.resolve();
	}
}

class TestLogger {
	readonly lines: string[] = [];
	appendLine(message: string): void {
		this.lines.push(message);
	}
}

function location(fsPath: string): ProjectLocation {
	return { scheme: 'file', fsPath };
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value?: T): void } {
	let resolvePromise: (value: T | PromiseLike<T>) => void = () => { };
	const promise = new Promise<T>(resolve => resolvePromise = resolve);
	return { promise, resolve: value => resolvePromise(value as T) };
}
