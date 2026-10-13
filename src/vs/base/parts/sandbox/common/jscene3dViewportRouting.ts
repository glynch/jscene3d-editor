/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJScene3DViewportFailure, IJScene3DViewportFrameConsumer, IJScene3DViewportSessionIdentity } from './jscene3dViewportProtocol.js';
import { isViewportFrameIdentity, isViewportPaneId, isViewportSessionIdentity } from './jscene3dViewportCodec.js';

/** Starts every owned viewport stop before waiting for asynchronous renderer cleanup. */
export async function stopViewportSessions<T>(sessions: Iterable<T>, stop: (session: T) => Promise<void>): Promise<void> {
	await Promise.all(Array.from(sessions, session => stop(session)));
}

interface IJScene3DViewportFrameRegistration<T> {
	readonly consumer: IJScene3DViewportFrameConsumer<T>;
	session?: IJScene3DViewportSessionIdentity;
	surfaceGeneration: number;
	frameNumber: number;
}

export class JScene3DViewportFrameRouter<T> {
	private readonly registrations = new Map<string, IJScene3DViewportFrameRegistration<T>>();

	register(paneId: string, consumer: IJScene3DViewportFrameConsumer<T>): boolean {
		if (!isViewportPaneId(paneId) || this.registrations.has(paneId)) {
			return false;
		}
		this.registrations.set(paneId, { consumer, surfaceGeneration: 0, frameNumber: 0 });
		return true;
	}

	unregister(paneId: string): void {
		this.registrations.delete(paneId);
	}

	bindSession(paneId: string, session: IJScene3DViewportSessionIdentity): boolean {
		const registration = this.registrations.get(paneId);
		if (!registration || !isViewportSessionIdentity(session)) {
			return false;
		}
		registration.session = session;
		registration.surfaceGeneration = 0;
		registration.frameNumber = 0;
		return true;
	}

	unbindSession(paneId: string, session?: IJScene3DViewportSessionIdentity): void {
		const registration = this.registrations.get(paneId);
		if (!registration || (session && !this.matches(registration.session, session))) {
			return;
		}
		registration.session = undefined;
		registration.surfaceGeneration = 0;
		registration.frameNumber = 0;
	}

	async route(frame: T, identity: unknown): Promise<boolean> {
		if (!isViewportFrameIdentity(identity)) {
			return false;
		}
		const registration = this.registrations.get(identity.paneId);
		if (!registration || !this.matches(registration.session, identity)) {
			return false;
		}
		if (identity.surfaceGeneration < registration.surfaceGeneration
			|| (identity.surfaceGeneration === registration.surfaceGeneration && identity.frameNumber <= registration.frameNumber)) {
			return false;
		}
		registration.surfaceGeneration = identity.surfaceGeneration;
		registration.frameNumber = identity.frameNumber;
		await registration.consumer.onFrame(frame, identity);
		return true;
	}

	fail(failure: unknown): boolean {
		if (!failure || typeof failure !== 'object') {
			return false;
		}
		const candidate = failure as Partial<IJScene3DViewportFailure>;
		if (!isViewportPaneId(candidate.paneId) || typeof candidate.message !== 'string' || candidate.message.length === 0) {
			return false;
		}
		const registration = this.registrations.get(candidate.paneId);
		if (!registration || (candidate.session && !this.matches(registration.session, candidate.session))) {
			return false;
		}
		registration.consumer.onFailure(candidate as IJScene3DViewportFailure);
		return true;
	}

	private matches(actual: IJScene3DViewportSessionIdentity | undefined, expected: IJScene3DViewportSessionIdentity): boolean {
		return actual?.sessionId === expected.sessionId && actual.rendererGeneration === expected.rendererGeneration;
	}
}

