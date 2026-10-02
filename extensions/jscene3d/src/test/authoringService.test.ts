/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import {
	AuthoringProcess,
	AuthoringProcessLauncher,
	AuthoringService,
	AuthoringServiceTimeouts
} from '../authoring/authoringService';
import { ContentLengthDecoder, encodeContentLengthFrame } from '../protocol/contentLengthFraming';
import { JsonObject } from '../protocol/messageTransport';
import { ProjectState } from '../project/projectState';

const timeouts: AuthoringServiceTimeouts = {
	startupMilliseconds: 20,
	shutdownAcknowledgementMilliseconds: 20,
	gracefulExitMilliseconds: 20,
	terminateExitMilliseconds: 20,
	killExitMilliseconds: 20
};

suite('JScene3D authoring service lifecycle', () => {
	test('sends the configured Code OSS UI language during initialization', async () => {
		const process = new TestAuthoringProcess();
		process.exitAfterShutdown = true;
		const service = new AuthoringService(
			() => ({ javaExecutable: 'java', modulePath: 'test-module-path', installedExtensionMetadata: [], clientLanguage: 'fr-CA' }),
			new SingleProcessLauncher(process),
			new TestLogger(),
			timeouts
		);

		await service.openProject('/projects/sample/sample.j3d');
		await service.shutdown();

		assert.deepStrictEqual(process.initializationLanguages, ['fr-CA']);
	});

	test('returns a definition result atomically with its validated Java connection generation', async () => {
		const process = new TestAuthoringProcess();
		process.exitAfterShutdown = true;
		const service = createService(process);

		await service.openProject('/projects/sample/sample.j3d');
		const response = await service.openDefinition(7, 'world:main');
		await service.shutdown();

		assert.deepStrictEqual({
			connectionGeneration: response.connectionGeneration,
			opened: response.result.opened,
			projectGeneration: response.result.projectGeneration,
			assetId: response.result.definition?.context.assetId
		}, {
			connectionGeneration: 'connection-test',
			opened: true,
			projectGeneration: 7,
			assetId: 'world:main'
		});
	});

	test('shares concurrent startup without launching another process', async () => {
		const process = new TestAuthoringProcess();
		process.respondToInitialize = false;
		process.exitOnSignal.add('SIGTERM');
		const launcher = new SingleProcessLauncher(process);
		const service = new AuthoringService(
			() => ({ javaExecutable: 'java', modulePath: 'test-module-path', installedExtensionMetadata: [], clientLanguage: 'fr-CA' }),
			launcher,
			new TestLogger(),
			timeouts
		);
		const first = assert.rejects(service.openProject('/projects/a/a.j3d'));
		const second = assert.rejects(service.openProject('/projects/b/b.j3d'));
		assert.strictEqual(launcher.calls, 1);
		await service.shutdown();
		await Promise.all([first, second]);
	});

	test('bounds shutdown while startup is hung and reaps the process', async () => {
		const process = new TestAuthoringProcess();
		process.respondToInitialize = false;
		process.exitOnSignal.add('SIGTERM');
		const service = createService(process);
		const opening = service.openProject('/projects/sample/sample.j3d');
		const rejectedOpening = assert.rejects(opening);
		await service.shutdown();
		await rejectedOpening;
		assert.deepStrictEqual(process.killSignals, ['SIGTERM']);
		assert.strictEqual(process.exited, true);
		assert.strictEqual(service.state, 'stopped');
	});

	test('bounds a hung shutdown acknowledgement', async () => {
		const process = new TestAuthoringProcess();
		process.respondToShutdown = false;
		process.exitOnSignal.add('SIGTERM');
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		await service.shutdown();
		assert.deepStrictEqual(process.killSignals, ['SIGTERM']);
		assert.strictEqual(process.exited, true);
	});

	test('terminates a process that does not exit after graceful shutdown', async () => {
		const process = new TestAuthoringProcess();
		process.exitOnSignal.add('SIGTERM');
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		await service.shutdown();
		assert.deepStrictEqual(process.killSignals, ['SIGTERM']);
		assert.strictEqual(process.exited, true);
	});

	test('escalates termination when the process ignores SIGTERM', async () => {
		const process = new TestAuthoringProcess();
		process.exitOnSignal.add('SIGKILL');
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		await service.shutdown();
		assert.deepStrictEqual(process.killSignals, ['SIGTERM', 'SIGKILL']);
		assert.strictEqual(process.exited, true);
	});

	test('fails within the bounded policy when the process cannot be reaped', async () => {
		const process = new TestAuthoringProcess();
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		await assert.rejects(service.shutdown(), /Timed out waiting for the authoring service to exit/);
		assert.deepStrictEqual(process.killSignals, ['SIGTERM', 'SIGKILL']);
		assert.strictEqual(service.state, 'failed');
	});

	test('observes graceful process exit without sending a signal', async () => {
		const process = new TestAuthoringProcess();
		process.exitAfterShutdown = true;
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		await service.shutdown();
		assert.deepStrictEqual(process.killSignals, []);
		assert.strictEqual(process.exited, true);
	});

	test('shares repeated shutdown and disposal', async () => {
		const process = new TestAuthoringProcess();
		process.exitAfterShutdown = true;
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		const first = service.shutdown();
		const second = service.shutdown();
		service.dispose();
		assert.strictEqual(first, second);
		await first;
		assert.strictEqual(process.shutdownRequests, 1);
	});

	test('propagates idle protocol failure once and reaps the process', async () => {
		const process = new TestAuthoringProcess();
		const logger = new TestLogger();
		const service = createService(process, logger);
		const state = new ProjectState(service, logger);
		await state.open('/projects/sample/sample.j3d');
		const failures: Error[] = [];
		service.onDidFail(error => failures.push(error));
		process.stdout.write(Buffer.from('Content-Length: nope\r\n\r\n{}'));
		assert.strictEqual(service.state, 'failed');
		assert.strictEqual(state.snapshot.status, 'serviceUnavailable');
		assert.strictEqual(failures.length, 1);
		process.exit(1, null);
		assert.strictEqual(failures.length, 1);
		assert.strictEqual(process.exited, true);
		await service.shutdown();
	});

	test('treats a structured Stage 1 server error as terminal', async () => {
		const process = new TestAuthoringProcess();
		process.openErrorCode = -32603;
		process.exitOnSignal.add('SIGTERM');
		const service = createService(process);
		await assert.rejects(service.openProject('/projects/sample/sample.j3d'), /Internal error/);
		assert.strictEqual(service.state, 'failed');
		await service.shutdown();
		assert.strictEqual(process.exited, true);
	});

	test('reports an unexpected process exit once', async () => {
		const process = new TestAuthoringProcess();
		const service = createService(process);
		await service.openProject('/projects/sample/sample.j3d');
		const failures: Error[] = [];
		service.onDidFail(error => failures.push(error));
		process.exit(9, null);
		assert.strictEqual(service.state, 'failed');
		assert.strictEqual(failures.length, 1);
		assert.match(failures[0].message, /exit code 9/);
		await service.shutdown();
	});

	test('rejects an in-flight request during shutdown', async () => {
		const process = new TestAuthoringProcess();
		process.respondToOpen = false;
		process.respondToShutdown = false;
		process.exitOnSignal.add('SIGTERM');
		const service = createService(process);
		const opening = service.openProject('/projects/sample/sample.j3d');
		const rejectedOpening = assert.rejects(opening);
		await process.initialized;
		await service.shutdown();
		await rejectedOpening;
		assert.strictEqual(process.exited, true);
	});

	test('reconstructs stderr lines split across chunks and flushes the trailing line', async () => {
		const process = new TestAuthoringProcess();
		process.exitAfterShutdown = true;
		const logger = new TestLogger();
		const service = createService(process, logger);
		await service.openProject('/projects/sample/sample.j3d');
		process.stderr.write('first');
		process.stderr.write(' line\nsecond\npart');
		process.stderr.write('ial');
		await service.shutdown();
		assert.deepStrictEqual(logger.lines.filter(line => line.startsWith('[Java]')), [
			'[Java] first line',
			'[Java] second',
			'[Java] partial'
		]);
	});
});

class TestAuthoringProcess extends EventEmitter implements AuthoringProcess {
	readonly stdin = new PassThrough();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly killSignals: NodeJS.Signals[] = [];
	readonly exitOnSignal = new Set<NodeJS.Signals>();
	readonly initializationLanguages: string[] = [];
	respondToInitialize = true;
	respondToOpen = true;
	openErrorCode: number | undefined;
	respondToShutdown = true;
	exitAfterShutdown = false;
	exitCode: number | null = null;
	signalCode: NodeJS.Signals | null = null;
	shutdownRequests = 0;
	private readonly decoder = new ContentLengthDecoder();
	private initializedResolve: (() => void) | undefined;
	readonly initialized = new Promise<void>(resolve => this.initializedResolve = resolve);

	constructor() {
		super();
		this.stdin.on('data', chunk => {
			for (const payload of this.decoder.accept(Buffer.from(chunk))) {
				this.acceptRequest(jsonObject(JSON.parse(payload)));
			}
		});
	}

	get exited(): boolean {
		return this.exitCode !== null || this.signalCode !== null;
	}

	kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
		this.killSignals.push(signal);
		if (this.exitOnSignal.has(signal)) {
			this.exit(null, signal);
		}
		return true;
	}

	exit(code: number | null, signal: NodeJS.Signals | null): void {
		if (this.exited) {
			return;
		}
		this.exitCode = code;
		this.signalCode = signal;
		this.emit('exit', code, signal);
	}

	private acceptRequest(message: JsonObject): void {
		const id = message.id;
		if (typeof id !== 'number') {
			throw new Error('Expected a numeric request ID');
		}
		switch (message.method) {
			case 'initialize':
				this.initializationLanguages.push(requiredString(jsonObject(message.params).clientLanguage));
				if (this.respondToInitialize) {
					this.respond(id, {
						protocolVersion: { major: 1, minor: 5 },
						processKind: 'authoring',
						serviceVersion: 'test',
						engineVersion: 'test',
						capabilities: [
							'project/open', 'project/replace', 'project/close', 'viewport/prepareLaunch', 'definition/open',
							'definition/mutate', 'definition/undo', 'definition/redo',
							'definition/save', 'definition/revert', 'definition/backup',
							'definition/restoreBackup',
							'inspector/read', 'service/shutdown'
						]
					});
					this.initializedResolve?.();
				}
				break;
			case 'project/open':
				if (this.respondToOpen) {
					if (this.openErrorCode !== undefined) {
						this.respondError(id, this.openErrorCode, 'Internal error');
						break;
					}
					this.respond(id, {
						opened: true,
						projectGeneration: 7,
						project: {
							id: 'sample',
							name: 'Sample',
							version: '1.0.0',
							root: '/projects/sample',
							descriptor: '/projects/sample/sample.j3d',
							startupWorld: { id: 'world:main', name: 'Main' },
							assetCounts: { authored: 1, projected: 1 }
						},
						diagnostics: [],
						failureCode: null
					});
				}
				break;
			case 'project/replace':
				this.respond(id, {
					outcome: 'replaced',
					projectGeneration: 8,
					project: {
						id: 'replacement',
						name: 'Replacement',
						version: '1.0.0',
						root: '/projects/replacement',
						descriptor: '/projects/replacement/replacement.j3d',
						startupWorld: { id: 'world:main', name: 'Main' },
						assetCounts: { authored: 1, projected: 1 }
					},
					diagnostics: [],
					failureCode: null
				});
				break;
			case 'definition/open':
				this.respond(id, {
					opened: true,
					projectGeneration: 7,
					definition: {
						revision: 0,
						context: {
							assetId: 'world:main',
							kind: 'world-definition',
							origin: 'authored',
							editable: true,
							source: 'file:///projects/sample/worlds/main.world.json',
							label: { kind: 'literal', text: 'Main', messageCode: null, arguments: [] }
						},
						roots: []
					},
					diagnostics: [],
					failureCode: null
				});
				break;
			case 'service/shutdown':
				this.shutdownRequests++;
				if (this.respondToShutdown) {
					this.respond(id, { shutdown: true });
					if (this.exitAfterShutdown) {
						this.exit(0, null);
					}
				}
				break;
		}
	}

	private respond(id: number, result: JsonObject): void {
		this.stdout.write(encodeContentLengthFrame(JSON.stringify({
			jsonrpc: '2.0',
			id,
			connectionGeneration: 'connection-test',
			result
		})));
	}

	private respondError(id: number, code: number, message: string): void {
		this.stdout.write(encodeContentLengthFrame(JSON.stringify({
			jsonrpc: '2.0',
			id,
			connectionGeneration: 'connection-test',
			error: { code, message }
		})));
	}
}

class SingleProcessLauncher implements AuthoringProcessLauncher {
	calls = 0;

	constructor(private readonly process: AuthoringProcess) { }

	launch(): AuthoringProcess {
		this.calls++;
		return this.process;
	}
}

class TestLogger {
	readonly lines: string[] = [];

	appendLine(message: string): void {
		this.lines.push(message);
	}
}

function createService(process: TestAuthoringProcess, logger = new TestLogger()): AuthoringService {
	return new AuthoringService(
		() => ({ javaExecutable: 'java', modulePath: 'test-module-path', installedExtensionMetadata: [], clientLanguage: 'en' }),
		new SingleProcessLauncher(process),
		logger,
		timeouts
	);
}

function jsonObject(value: unknown): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Expected a JSON object');
	}
	return value as JsonObject;
}

function requiredString(value: unknown): string {
	if (typeof value !== 'string') {
		throw new Error('Expected a string');
	}
	return value;
}
