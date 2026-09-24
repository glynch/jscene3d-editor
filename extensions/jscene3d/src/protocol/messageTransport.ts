/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Readable, Writable } from 'stream';
import { ContentLengthDecoder, encodeContentLengthFrame, ProtocolFramingError } from './contentLengthFraming';

export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

/** Abstracts framed JSON message delivery from request correlation. */
export interface MessageTransport {
	onMessage(listener: (message: JsonObject) => void): { dispose(): void };
	onClose(listener: (error: Error) => void): { dispose(): void };
	send(message: JsonObject): Promise<void>;
	dispose(): void;
}

/** Owns framed JSON messages over one process stdin/stdout pair. */
export class StreamMessageTransport implements MessageTransport {
	private readonly decoder = new ContentLengthDecoder();
	private readonly messageListeners = new Set<(message: JsonObject) => void>();
	private readonly closeListeners = new Set<(error: Error) => void>();
	private writeQueue = Promise.resolve();
	private closed = false;

	constructor(private readonly input: Readable, private readonly output: Writable) {
		input.on('data', this.acceptData);
		input.once('end', this.acceptEnd);
		input.once('error', this.acceptError);
		output.once('error', this.acceptError);
	}

	onMessage(listener: (message: JsonObject) => void): { dispose(): void } {
		this.messageListeners.add(listener);
		return { dispose: () => this.messageListeners.delete(listener) };
	}

	onClose(listener: (error: Error) => void): { dispose(): void } {
		this.closeListeners.add(listener);
		return { dispose: () => this.closeListeners.delete(listener) };
	}

	send(message: JsonObject): Promise<void> {
		if (this.closed) {
			return Promise.reject(new Error('Authoring protocol transport is closed'));
		}
		const frame = encodeContentLengthFrame(JSON.stringify(message));
		this.writeQueue = this.writeQueue.then(() => new Promise<void>((resolve, reject) => {
			this.output.write(frame, error => error ? reject(error) : resolve());
		}));
		this.writeQueue.catch(error => this.close(error instanceof Error ? error : new Error(String(error))));
		return this.writeQueue;
	}

	dispose(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.detach();
		this.output.end();
		this.messageListeners.clear();
		this.closeListeners.clear();
	}

	private readonly acceptData = (chunk: Buffer | string): void => {
		try {
			for (const payload of this.decoder.accept(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))) {
				const parsed: unknown = JSON.parse(payload);
				if (!isJsonObject(parsed)) {
					throw new ProtocolFramingError('Protocol payload must be a JSON object');
				}
				for (const listener of this.messageListeners) {
					listener(parsed);
				}
			}
		} catch (error) {
			this.close(error instanceof Error ? error : new Error(String(error)));
		}
	};

	private readonly acceptEnd = (): void => {
		try {
			this.decoder.end();
			this.close(new Error('Authoring protocol reached EOF'));
		} catch (error) {
			this.close(error instanceof Error ? error : new Error(String(error)));
		}
	};

	private readonly acceptError = (error: Error): void => this.close(error);

	private close(error: Error): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.detach();
		for (const listener of this.closeListeners) {
			listener(error);
		}
		this.messageListeners.clear();
		this.closeListeners.clear();
	}

	private detach(): void {
		this.input.off('data', this.acceptData);
		this.input.off('end', this.acceptEnd);
		this.input.off('error', this.acceptError);
		this.output.off('error', this.acceptError);
	}
}

/** Tests whether a parsed JSON value is an object suitable for a protocol envelope. */
function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
