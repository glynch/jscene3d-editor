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
	private buffered = Buffer.alloc(0);

	accept(chunk: Buffer): string[] {
		if (chunk.length === 0) {
			return [];
		}

		this.buffered = Buffer.concat([this.buffered, chunk]);
		const messages: string[] = [];
		while (this.buffered.length > 0) {
			const headerEnd = this.buffered.indexOf(headerTerminator);
			if (headerEnd < 0) {
				if (this.buffered.length > maximumHeaderBytes) {
					throw new ProtocolFramingError(`Protocol headers exceed ${maximumHeaderBytes} bytes`);
				}
				break;
			}

			const headerLength = headerEnd + headerTerminator.length;
			if (headerLength > maximumHeaderBytes) {
				throw new ProtocolFramingError(`Protocol headers exceed ${maximumHeaderBytes} bytes`);
			}
			const payloadLength = this.readContentLength(this.buffered.subarray(0, headerEnd));
			const frameLength = headerLength + payloadLength;
			if (this.buffered.length < frameLength) {
				break;
			}

			const payload = this.buffered.subarray(headerLength, frameLength);
			this.buffered = this.buffered.subarray(frameLength);
			try {
				messages.push(new TextDecoder('utf-8', { fatal: true }).decode(payload));
			} catch {
				throw new ProtocolFramingError('Protocol payload is not valid UTF-8');
			}
		}
		return messages;
	}

	end(): void {
		if (this.buffered.length !== 0) {
			throw new ProtocolFramingError('Unexpected EOF in protocol frame');
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
