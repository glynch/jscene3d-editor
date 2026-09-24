/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonObject, JsonValue, MessageTransport } from './messageTransport';

/** Associates a validated response result with its Java connection generation. */
export interface JsonRpcResult<T> {
	readonly result: T;
	readonly connectionGeneration: string;
}

/** Represents a structured error response returned by the authoring service. */
export class JsonRpcError extends Error {
	constructor(readonly code: number, message: string, readonly data?: JsonValue) {
		super(message);
		this.name = 'JsonRpcError';
	}
}

/** Completion callbacks retained for one outstanding request ID. */
interface PendingRequest {
	readonly accept: (value: JsonValue, connectionGeneration: string) => void;
	readonly reject: (error: Error) => void;
}

/** Correlates JSON-RPC-style requests over the framed authoring transport. */
export class JsonRpcClient {
	private readonly pending = new Map<number, PendingRequest>();
	private readonly failureListeners = new Set<(error: Error) => void>();
	private nextRequestId = 1;
	private closed = false;

	constructor(private readonly transport: MessageTransport) {
		transport.onMessage(message => this.accept(message));
		transport.onClose(error => this.fail(error, true));
	}

	onDidFail(listener: (error: Error) => void): { dispose(): void } {
		this.failureListeners.add(listener);
		return { dispose: () => this.failureListeners.delete(listener) };
	}

	request<T>(method: string, params: JsonObject, validate: (value: JsonValue) => T): Promise<JsonRpcResult<T>> {
		if (this.closed) {
			return Promise.reject(new Error('Authoring protocol client is closed'));
		}
		const id = this.nextRequestId++;
		return new Promise<JsonRpcResult<T>>((resolve, reject) => {
			this.pending.set(id, {
				accept: (value, connectionGeneration) => resolve({ result: validate(value), connectionGeneration }),
				reject
			});
			void this.transport.send({ jsonrpc: '2.0', id, method, params }).catch(error => {
				this.fail(error instanceof Error ? error : new Error(String(error)), true);
			});
		});
	}

	dispose(): void {
		this.fail(new Error('Authoring protocol client was disposed'), false);
		this.transport.dispose();
		this.failureListeners.clear();
	}

	private accept(message: JsonObject): void {
		if (message.jsonrpc !== '2.0' || typeof message.id !== 'number' || !Number.isSafeInteger(message.id)) {
			this.failProtocol(new Error('Received an invalid authoring protocol response'));
			return;
		}
		const request = this.pending.get(message.id);
		if (request === undefined) {
			this.failProtocol(new Error(`Received a response for unknown response ID ${message.id}`));
			return;
		}

		try {
			if (typeof message.connectionGeneration !== 'string' || message.connectionGeneration.length === 0) {
				throw new Error('Protocol response is missing its connection generation');
			}
			const hasResult = Object.hasOwn(message, 'result');
			const hasError = Object.hasOwn(message, 'error');
			if (hasResult && hasError) {
				throw new Error('Protocol response contains both a result and an error');
			}
			if (!hasResult && !hasError) {
				throw new Error('Protocol response contains neither a result nor an error');
			}
			if (hasError) {
				if (!isJsonObject(message.error)) {
					throw new Error('Protocol response contains an invalid error');
				}
				if (typeof message.error.code !== 'number' || !Number.isSafeInteger(message.error.code) || typeof message.error.message !== 'string') {
					throw new Error('Protocol response contains an invalid error');
				}
				this.pending.delete(message.id);
				request.reject(new JsonRpcError(message.error.code, message.error.message, message.error.data));
				return;
			}
			request.accept(message.result ?? null, message.connectionGeneration);
			this.pending.delete(message.id);
		} catch (error) {
			this.failProtocol(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private failProtocol(error: Error): void {
		this.fail(error, true);
		this.transport.dispose();
	}

	private fail(error: Error, notify: boolean): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		for (const request of this.pending.values()) {
			request.reject(error);
		}
		this.pending.clear();
		if (notify) {
			for (const listener of Array.from(this.failureListeners)) {
				listener(error);
			}
		}
	}
}

/** Tests whether an optional JSON value is an object. */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
