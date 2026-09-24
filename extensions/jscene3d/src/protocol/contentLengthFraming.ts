/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDecoder } from 'util';

const headerTerminator = Buffer.from('\r\n\r\n', 'ascii');
const maximumHeaderBytes = 8 * 1024;
const maximumPayloadBytes = 8 * 1024 * 1024;

/** Identifies malformed or incomplete authoring protocol framing. */
export class ProtocolFramingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProtocolFramingError';
	}
}

/** Incrementally decodes the authoring service's byte-oriented Content-Length frames. */
export class ContentLengthDecoder {
	private readonly header = Buffer.allocUnsafe(maximumHeaderBytes);
	private headerLength = 0;
	private payload: Buffer | undefined;
	private payloadLength = 0;

	accept(chunk: Buffer): string[] {
		const messages: string[] = [];
		let offset = 0;
		while (offset < chunk.length) {
			if (this.payload === undefined) {
				offset = this.acceptHeader(chunk, offset, messages);
			} else {
				offset = this.acceptPayload(chunk, offset, messages);
			}
		}
		return messages;
	}

	end(): void {
		if (this.headerLength !== 0 || this.payload !== undefined) {
			throw new ProtocolFramingError('Unexpected EOF in protocol frame');
		}
	}

	private acceptHeader(chunk: Buffer, offset: number, messages: string[]): number {
		while (offset < chunk.length) {
			if (this.headerLength === maximumHeaderBytes) {
				throw new ProtocolFramingError(`Protocol headers exceed ${maximumHeaderBytes} bytes`);
			}
			this.header[this.headerLength++] = chunk[offset++];
			if (this.headerLength >= headerTerminator.length
				&& this.header.subarray(this.headerLength - headerTerminator.length, this.headerLength).equals(headerTerminator)) {
				const payloadSize = this.readContentLength(this.header.subarray(0, this.headerLength - headerTerminator.length));
				this.headerLength = 0;
				this.payload = Buffer.allocUnsafe(payloadSize);
				this.payloadLength = 0;
				if (payloadSize === 0) {
					this.completePayload(messages);
				}
				break;
			}
		}
		return offset;
	}

	private acceptPayload(chunk: Buffer, offset: number, messages: string[]): number {
		const payload = this.payload;
		if (payload === undefined) {
			return offset;
		}
		const length = Math.min(payload.length - this.payloadLength, chunk.length - offset);
		chunk.copy(payload, this.payloadLength, offset, offset + length);
		this.payloadLength += length;
		offset += length;
		if (this.payloadLength === payload.length) {
			this.completePayload(messages);
		}
		return offset;
	}

	private completePayload(messages: string[]): void {
		const payload = this.payload;
		if (payload === undefined) {
			return;
		}
		this.payload = undefined;
		this.payloadLength = 0;
		try {
			messages.push(new TextDecoder('utf-8', { fatal: true }).decode(payload));
		} catch {
			throw new ProtocolFramingError('Protocol payload is not valid UTF-8');
		}
	}

	private readContentLength(header: Buffer): number {
		let value: string | undefined;
		for (const line of header.toString('latin1').split('\r\n')) {
			const separator = line.indexOf(':');
			if (separator <= 0) {
				throw new ProtocolFramingError('Malformed protocol header');
			}
			if (line.slice(0, separator).trim().toLowerCase() !== 'content-length') {
				continue;
			}
			if (value !== undefined) {
				throw new ProtocolFramingError('Duplicate Content-Length header');
			}
			value = line.slice(separator + 1).trim();
		}

		if (value === undefined || value.length === 0) {
			throw new ProtocolFramingError('Missing Content-Length header');
		}
		if (!/^[0-9]+$/.test(value)) {
			throw new ProtocolFramingError('Malformed Content-Length header');
		}
		const parsed = Number(value);
		if (!Number.isSafeInteger(parsed) || parsed > maximumPayloadBytes) {
			throw new ProtocolFramingError('Content-Length is outside the supported range');
		}
		return parsed;
	}
}

/** Encodes one JSON payload using its UTF-8 byte length. */
export function encodeContentLengthFrame(message: string): Buffer {
	const payload = Buffer.from(message, 'utf8');
	if (payload.length > maximumPayloadBytes) {
		throw new ProtocolFramingError('Protocol payload exceeds the supported range');
	}
	return Buffer.concat([
		Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii'),
		payload
	]);
}
