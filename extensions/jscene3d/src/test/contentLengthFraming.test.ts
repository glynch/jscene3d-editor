/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { PassThrough } from 'stream';
import { ContentLengthDecoder, encodeContentLengthFrame, ProtocolFramingError } from '../protocol/contentLengthFraming';
import { StreamMessageTransport } from '../protocol/messageTransport';

suite('JScene3D Content-Length framing', () => {
	test('decodes one complete message', () => {
		const decoder = new ContentLengthDecoder();
		assert.deepStrictEqual(decoder.accept(encodeContentLengthFrame('{"ok":true}')), ['{"ok":true}']);
	});

	test('waits for a partial header', () => {
		const decoder = new ContentLengthDecoder();
		assert.deepStrictEqual(decoder.accept(Buffer.from('Content-Len')), []);
		assert.deepStrictEqual(decoder.accept(Buffer.from('gth: 2\r\n\r\n{}')), ['{}']);
	});

	test('waits for a partial payload', () => {
		const decoder = new ContentLengthDecoder();
		assert.deepStrictEqual(decoder.accept(Buffer.from('Content-Length: 4\r\n\r\n{"')), []);
		assert.deepStrictEqual(decoder.accept(Buffer.from('x}')), ['{"x}']);
	});

	test('decodes multiple messages from one chunk', () => {
		const decoder = new ContentLengthDecoder();
		const chunk = Buffer.concat([encodeContentLengthFrame('{}'), encodeContentLengthFrame('{"n":2}')]);
		assert.deepStrictEqual(decoder.accept(chunk), ['{}', '{"n":2}']);
	});

	test('decodes a payload larger than a stream buffer', () => {
		const message = JSON.stringify({ text: 'x'.repeat(64 * 1024) });
		assert.deepStrictEqual(new ContentLengthDecoder().accept(encodeContentLengthFrame(message)), [message]);
	});

	test('uses UTF-8 byte length', () => {
		const message = '{"name":"โลก"}';
		const frame = encodeContentLengthFrame(message);
		assert.match(frame.subarray(0, frame.indexOf('\r\n')).toString('ascii'), /Content-Length: 20$/);
		assert.deepStrictEqual(new ContentLengthDecoder().accept(frame), [message]);
	});

	test('rejects malformed Content-Length', () => {
		const decoder = new ContentLengthDecoder();
		assert.throws(
			() => decoder.accept(Buffer.from('Content-Length: nope\r\n\r\n{}')),
			(error: Error) => error instanceof ProtocolFramingError && error.message === 'Malformed Content-Length header'
		);
	});

	test('rejects invalid JSON at the message transport boundary', () => {
		const input = new PassThrough();
		const output = new PassThrough();
		const transport = new StreamMessageTransport(input, output);
		let failure: Error | undefined;
		transport.onClose(error => failure = error);
		input.write(encodeContentLengthFrame('{invalid'));
		assert.match(failure?.message ?? '', /JSON/);
	});

	test('rejects EOF with an incomplete message', () => {
		const decoder = new ContentLengthDecoder();
		decoder.accept(Buffer.from('Content-Length: 4\r\n\r\n{}'));
		assert.throws(() => decoder.end(), /Unexpected EOF/);
	});

	test('serializes concurrent writes as complete frames', async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		const chunks: Buffer[] = [];
		output.on('data', chunk => chunks.push(Buffer.from(chunk)));
		const transport = new StreamMessageTransport(input, output);
		await Promise.all([
			transport.send({ sequence: 1 }),
			transport.send({ sequence: 2 })
		]);
		assert.deepStrictEqual(new ContentLengthDecoder().accept(Buffer.concat(chunks)), [
			'{"sequence":1}',
			'{"sequence":2}'
		]);
		transport.dispose();
	});
});
