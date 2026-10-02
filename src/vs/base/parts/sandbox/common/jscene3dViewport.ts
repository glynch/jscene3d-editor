/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IJScene3DViewportSessionIdentity {
	readonly sessionId: number;
	readonly rendererGeneration: number;
}

export interface IJScene3DViewportFrameIdentity extends IJScene3DViewportSessionIdentity {
	readonly paneId: string;
	readonly surfaceGeneration: number;
	readonly frameNumber: number;
}

export interface IJScene3DViewportFailure {
	readonly paneId: string;
	readonly session?: IJScene3DViewportSessionIdentity;
	readonly message: string;
}

/** Java-prepared semantic identity and runtime inputs for one project viewport. */
export interface IJScene3DViewportLaunch {
	readonly viewportId: string;
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly worldAssetId: string;
	readonly worldName: string;
	readonly runtimeArtifacts: readonly string[];
}

export interface IJScene3DViewportBridge {
	registerPane(
		paneId: string,
		onFrame: (frame: VideoFrame, identity: IJScene3DViewportFrameIdentity) => Promise<void>,
		onFailure: (failure: IJScene3DViewportFailure) => void
	): void;
	unregisterPane(paneId: string): void;
	start(paneId: string, launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DViewportSessionIdentity>;
	resize(paneId: string, session: IJScene3DViewportSessionIdentity, width: number, height: number): void;
	pause(paneId: string, session: IJScene3DViewportSessionIdentity): void;
	resume(paneId: string, session: IJScene3DViewportSessionIdentity): void;
	stop(paneId: string, session?: IJScene3DViewportSessionIdentity): Promise<void>;
}

export interface IJScene3DViewportFrameConsumer<T> {
	readonly onFrame: (frame: T, identity: IJScene3DViewportFrameIdentity) => Promise<void>;
	readonly onFailure: (failure: IJScene3DViewportFailure) => void;
}

interface IJScene3DViewportFrameRegistration<T> {
	readonly consumer: IJScene3DViewportFrameConsumer<T>;
	session?: IJScene3DViewportSessionIdentity;
	surfaceGeneration: number;
	frameNumber: number;
}

export function isViewportPaneId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function isViewportDimension(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 16384;
}

export function isViewportLaunch(value: unknown): value is IJScene3DViewportLaunch {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportLaunch>;
	return isViewportPaneId(candidate.viewportId)
		&& nonEmpty(candidate.connectionGeneration)
		&& Number.isInteger(candidate.projectGeneration) && candidate.projectGeneration! > 0
		&& nonEmpty(candidate.projectId)
		&& nonEmpty(candidate.projectName)
		&& nonEmpty(candidate.projectRoot)
		&& nonEmpty(candidate.publishedContentRoot)
		&& nonEmpty(candidate.engineVersion)
		&& nonEmpty(candidate.worldAssetId)
		&& nonEmpty(candidate.worldName)
		&& Array.isArray(candidate.runtimeArtifacts)
		&& candidate.runtimeArtifacts.every(nonEmpty);
}

function nonEmpty(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export function isViewportSessionIdentity(value: unknown): value is IJScene3DViewportSessionIdentity {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportSessionIdentity>;
	return Number.isInteger(candidate.sessionId) && candidate.sessionId! > 0
		&& Number.isInteger(candidate.rendererGeneration) && candidate.rendererGeneration! > 0;
}

export function isViewportFrameIdentity(value: unknown): value is IJScene3DViewportFrameIdentity {
	if (!isViewportSessionIdentity(value)) {
		return false;
	}
	const candidate = value as Partial<IJScene3DViewportFrameIdentity>;
	return isViewportPaneId(candidate.paneId)
		&& Number.isInteger(candidate.surfaceGeneration) && candidate.surfaceGeneration! > 0
		&& Number.isInteger(candidate.frameNumber) && candidate.frameNumber! > 0;
}

/** Starts every owned viewport stop before waiting for asynchronous renderer cleanup. */
export async function stopViewportSessions<T>(sessions: Iterable<T>, stop: (session: T) => Promise<void>): Promise<void> {
	await Promise.all(Array.from(sessions, session => stop(session)));
}

/** Routes native frames only to the pane and renderer session that registered for them. */
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
