/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { AuthoringProtocolClient } from '../protocol/authoringProtocol';
import { JsonRpcClient, JsonRpcError } from '../protocol/jsonRpcClient';
import { JsonObject, JsonValue, MessageTransport } from '../protocol/messageTransport';

suite('JScene3D authoring protocol client', () => {
	test('initializes with the compatible Java contract fixture', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize();
		transport.respond(fixture('initialize-response.json'));
		assert.deepStrictEqual(await initialization, {
			protocolVersion: { major: 1, minor: 0 },
			processKind: 'authoring',
			serviceVersion: '0.1.0-SNAPSHOT',
			engineVersion: '0.1.0-SNAPSHOT',
			capabilities: ['project/open', 'project/close', 'service/shutdown']
		});
		assert.deepStrictEqual(transport.sent[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: { major: 1, minor: 0 } }
		});
	});

	test('rejects an incompatible initialization', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize();
		const response = fixture('initialize-response.json');
		const result = object(response.result);
		transport.respond({ ...response, result: { ...result, protocolVersion: { major: 2, minor: 0 } } });
		await assert.rejects(initialization, /Incompatible authoring protocol 2.0/);
	});

	test('rejects initialization without a required capability', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize();
		const response = fixture('initialize-response.json');
		const result = object(response.result);
		transport.respond({ ...response, result: { ...result, capabilities: ['project/open'] } });
		await assert.rejects(initialization, /required capability project\/close/);
	});

	test('correlates responses received out of request order', async () => {
		const transport = new TestTransport();
		const rpc = new JsonRpcClient(transport);
		const first = rpc.request('first', {}, stringValue);
		const second = rpc.request('second', {}, stringValue);
		transport.respond(success(2, 'second'));
		transport.respond(success(1, 'first'));
		assert.deepStrictEqual([(await first).result, (await second).result], ['first', 'second']);
	});

	test('rejects a protocol error', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('failing', {}, stringValue);
		transport.respond({
			jsonrpc: '2.0',
			id: 1,
			connectionGeneration: 'connection-1',
			error: { code: -32001, message: 'Incompatible protocol major version' }
		});
		await assert.rejects(request, (error: Error) => error instanceof JsonRpcError && error.code === -32001);
	});

	test('rejects pending requests when the transport terminates', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('pending', {}, stringValue);
		transport.terminate(new Error('process exited'));
		await assert.rejects(request, /process exited/);
	});

	test('treats an unknown response ID as a terminal connection failure', async () => {
		const transport = new TestTransport();
		const rpc = new JsonRpcClient(transport);
		let failure: Error | undefined;
		rpc.onDidFail(error => failure = error);
		const request = rpc.request('pending', {}, stringValue);
		transport.respond(success(2, 'wrong request'));
		await assert.rejects(request, /unknown response ID 2/);
		assert.match(failure?.message ?? '', /unknown response ID 2/);
	});

	test('rejects a response containing both a result and an error', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('invalid', {}, stringValue);
		transport.respond({
			...success(1, 'unexpected result'),
			error: { code: -32603, message: 'Internal error' }
		});
		await assert.rejects(request, /both a result and an error/);
	});

	test('rejects result and error field coexistence even when the error is null', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('invalid', {}, stringValue);
		transport.respond({ ...success(1, 'unexpected result'), error: null });
		await assert.rejects(request, /both a result and an error/);
	});

	test('rejects a non-integer structured protocol error code', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('invalid', {}, stringValue);
		transport.respond({
			jsonrpc: '2.0',
			id: 1,
			connectionGeneration: 'connection-1',
			error: { code: -32603.5, message: 'Invalid error' }
		});
		await assert.rejects(request, /invalid error/);
	});

	test('rejects a project diagnostic with an unknown severity', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize();
		transport.respond(fixture('initialize-response.json'));
		await initialization;

		const opened = client.openProject('/projects/small/small.j3d');
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const diagnostics = jsonArray(result.diagnostics);
		transport.respond({
			...response,
			result: {
				...result,
				diagnostics: [{ ...object(diagnostics[0]), severity: 'notice' }]
			}
		});
		await assert.rejects(opened, /diagnostic.severity/);
	});

	test('rejects malformed nested project data', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openProject('/projects/small/small.j3d');
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const project = object(result.project);
		transport.respond({ ...response, result: { ...result, project: { ...project, startupWorld: null } } });
		await assert.rejects(opened, /startupWorld must be an object/);
	});

	test('rejects a non-integer project asset count', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openProject('/projects/small/small.j3d');
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const project = object(result.project);
		transport.respond({
			...response,
			result: {
				...result,
				project: { ...project, assetCounts: { authored: 1.5, projected: 4 } }
			}
		});
		await assert.rejects(opened, /assetCounts.authored must be a non-negative integer/);
	});

	test('rejects an inconsistent project-close result', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const closed = client.closeProject();
		transport.respond({
			jsonrpc: '2.0',
			id: 2,
			connectionGeneration: 'connection-1',
			result: { closed: false, invalidatedProjectGeneration: 7 }
		});
		await assert.rejects(closed, /inconsistent success shape/);
	});

	test('opens, closes, and shuts down using the Stage 1 DTOs', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize();
		transport.respond(fixture('initialize-response.json'));
		await initialization;

		const opened = client.openProject('/projects/small/small.j3d');
		transport.respond(fixture('project-open-response.json'));
		assert.deepStrictEqual((await opened).project?.assetCounts, { authored: 3, projected: 4 });

		const closed = client.closeProject();
		transport.respond(fixture('project-close-response.json'));
		assert.deepStrictEqual(await closed, { closed: true, invalidatedProjectGeneration: 1 });

		const shutdown = client.shutdown();
		transport.respond(fixture('shutdown-response.json'));
		assert.deepStrictEqual(await shutdown, { shutdown: true });
		assert.deepStrictEqual(transport.sent.map(message => message.method), [
			'initialize',
			'project/open',
			'project/close',
			'service/shutdown'
		]);
	});
});

class TestTransport implements MessageTransport {
	readonly sent: JsonObject[] = [];
	private readonly messageListeners = new Set<(message: JsonObject) => void>();
	private readonly closeListeners = new Set<(error: Error) => void>();

	onMessage(listener: (message: JsonObject) => void): { dispose(): void } {
		this.messageListeners.add(listener);
		return { dispose: () => this.messageListeners.delete(listener) };
	}

	onClose(listener: (error: Error) => void): { dispose(): void } {
		this.closeListeners.add(listener);
		return { dispose: () => this.closeListeners.delete(listener) };
	}

	send(message: JsonObject): Promise<void> {
		this.sent.push(message);
		return Promise.resolve();
	}

	respond(message: JsonObject): void {
		for (const listener of this.messageListeners) {
			listener(message);
		}
	}

	terminate(error: Error): void {
		for (const listener of this.closeListeners) {
			listener(error);
		}
	}

	dispose(): void { }
}

function fixture(name: string): JsonObject {
	const parsed: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
	return object(parsed);
}

function object(value: unknown): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Expected a JSON object fixture');
	}
	return value as JsonObject;
}

function jsonArray(value: JsonValue | undefined): readonly JsonValue[] {
	if (!Array.isArray(value)) {
		throw new Error('Expected a JSON array fixture');
	}
	return value;
}

async function initializedClient(transport: TestTransport): Promise<AuthoringProtocolClient> {
	const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
	const initialization = client.initialize();
	transport.respond(fixture('initialize-response.json'));
	await initialization;
	return client;
}

function success(id: number, result: JsonValue): JsonObject {
	return { jsonrpc: '2.0', id, connectionGeneration: 'connection-1', result };
}

function stringValue(value: JsonValue): string {
	if (typeof value !== 'string') {
		throw new Error('Expected a string result');
	}
	return value;
}
