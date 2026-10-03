/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { AuthoredDefinitionResource } from '../definition/authoredDefinitionState';
import { ConnectionScopedResult, ProjectDiagnosticDto, SceneViewReadResultDto, SceneViewSnapshotDto } from '../protocol/authoringProtocol';

/** Authoring operation required by the per-definition Scene View lifecycle. */
export interface SceneViewAuthoringClient {
	readSceneView(
		expectedProjectGeneration: number,
		sceneAssetId: string,
		expectedDefinitionRevision: number
	): Promise<ConnectionScopedResult<SceneViewReadResultDto>>;
}

/** Runtime-free launch accepted by the trusted native viewport bridge. */
export interface SceneViewportLaunch {
	readonly kind: 'scene';
	readonly viewportId: string;
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly sceneAssetId: string;
	readonly sceneName: string;
	readonly snapshot: SceneViewSnapshotDto;
}

/** Workbench boundary for opening, updating, and closing one native Scene View. */
export interface SceneViewHost {
	open(ownerResource: string, launch: SceneViewportLaunch): Promise<void>;
	update(viewportId: string, snapshot: SceneViewSnapshotDto): Promise<boolean | undefined>;
	close(viewportId: string): Promise<void>;
	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void;
}

/** Result used by the initial Scene editor to retain or replace its projection presentation. */
export type SceneViewSynchronizationOutcome =
	| { readonly status: 'not-applicable' | 'unchanged' | 'obsolete' | 'opened' | 'updated' }
	| { readonly status: 'failed'; readonly reason: string };

interface SceneViewSession {
	readonly viewportId: string;
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
	readonly sceneAssetId: string;
	revision: number;
}

/** Owns one independent native safe-renderer session per open authored Scene document. */
export class SceneViewLifecycle {
	private readonly sessions = new Map<string, SceneViewSession>();
	private readonly requestTokens = new Map<string, number>();

	constructor(
		private readonly client: SceneViewAuthoringClient,
		private readonly host: SceneViewHost,
		private readonly logger: { appendLine(message: string): void },
		private readonly createViewportId: () => string = randomUUID
	) { }

	async synchronize(definition: AuthoredDefinitionResource): Promise<SceneViewSynchronizationOutcome> {
		if (definition.snapshot.context.kind !== 'scene-definition') {
			return { status: 'not-applicable' };
		}
		const retained = this.sessions.get(definition.resource);
		if (retained !== undefined
			&& retained.projectGeneration === definition.projectGeneration
			&& retained.sceneAssetId === definition.assetId
			&& retained.revision >= definition.snapshot.revision) {
			return { status: 'unchanged' };
		}
		const token = (this.requestTokens.get(definition.resource) ?? 0) + 1;
		this.requestTokens.set(definition.resource, token);
		this.log(`projection requested for ${definition.assetId} revision ${definition.snapshot.revision}`);
		let scoped: ConnectionScopedResult<SceneViewReadResultDto>;
		try {
			scoped = await this.client.readSceneView(
				definition.projectGeneration,
				definition.assetId,
				definition.snapshot.revision
			);
		} catch (error) {
			const reason = errorMessage(error);
			this.log(`projection failed for ${definition.assetId}: ${reason}`);
			return { status: 'failed', reason };
		}
		if (this.requestTokens.get(definition.resource) !== token) {
			return { status: 'obsolete' };
		}
		const result = scoped.result;
		this.log(`projection completed for ${definition.assetId} revision ${definition.snapshot.revision}: ${result.outcome ?? result.failureCode ?? 'rejected'}`);
		this.host.publishDiagnostics(result.diagnostics);
		if (!result.accepted
			|| result.projectGeneration !== definition.projectGeneration
			|| result.sceneAssetId !== definition.assetId
			|| result.requestedRevision !== definition.snapshot.revision
			|| result.outcome !== 'projected'
			|| result.snapshot === null
			|| result.launch === null) {
			return { status: 'failed', reason: projectionFailureReason(result) };
		}

		const existing = this.sessions.get(definition.resource);
		if (existing === undefined) {
			const viewportId = this.createViewportId();
			try {
				this.log(`renderer launch requested for ${definition.assetId} revision ${result.snapshot.revision}`);
				await this.host.open(definition.resource, {
					kind: 'scene',
					viewportId,
					connectionGeneration: scoped.connectionGeneration,
					projectGeneration: result.projectGeneration,
					sceneAssetId: result.sceneAssetId,
					snapshot: result.snapshot,
					...result.launch
				});
			} catch (error) {
				const reason = errorMessage(error);
				this.log(`renderer launch failed for ${definition.assetId}: ${reason}`);
				return { status: 'failed', reason };
			}
			if (this.requestTokens.get(definition.resource) !== token) {
				await this.host.close(viewportId);
				return { status: 'obsolete' };
			}
			this.sessions.set(definition.resource, {
				viewportId,
				connectionGeneration: scoped.connectionGeneration,
				projectGeneration: result.projectGeneration,
				sceneAssetId: result.sceneAssetId,
				revision: result.snapshot.revision
			});
			return { status: 'opened' };
		}
		if (!sameOwner(existing, scoped.connectionGeneration, result.projectGeneration, result.sceneAssetId)) {
			await this.close(definition.resource);
			return this.synchronize(definition);
		}
		if (result.snapshot.revision <= existing.revision) {
			return { status: 'unchanged' };
		}
		let updated: boolean | undefined;
		try {
			updated = await this.host.update(existing.viewportId, result.snapshot);
		} catch (error) {
			const reason = errorMessage(error);
			this.log(`renderer update failed for ${definition.assetId}: ${reason}`);
			return { status: 'failed', reason };
		}
		if (updated === undefined) {
			this.sessions.delete(definition.resource);
			return this.synchronize(definition);
		}
		if (this.requestTokens.get(definition.resource) === token) {
			existing.revision = result.snapshot.revision;
			return { status: 'updated' };
		}
		return { status: 'obsolete' };
	}

	async close(resource: string): Promise<void> {
		this.requestTokens.set(resource, (this.requestTokens.get(resource) ?? 0) + 1);
		const session = this.sessions.get(resource);
		this.sessions.delete(resource);
		if (session !== undefined) {
			this.log(`viewport disposed for ${session.sceneAssetId}`);
			await this.host.close(session.viewportId);
		}
	}

	async closeAll(): Promise<void> {
		const resources = Array.from(this.sessions.keys());
		await Promise.all(resources.map(resource => this.close(resource)));
	}

	private log(message: string): void {
		this.logger.appendLine(`[${new Date().toISOString()}] [Scene View] ${message}`);
	}
}

function sameOwner(
	session: SceneViewSession,
	connectionGeneration: string,
	projectGeneration: number,
	sceneAssetId: string
): boolean {
	return session.connectionGeneration === connectionGeneration
		&& session.projectGeneration === projectGeneration
		&& session.sceneAssetId === sceneAssetId;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function projectionFailureReason(result: SceneViewReadResultDto): string {
	if (!result.accepted) {
		return `Scene projection was rejected: ${result.failureCode}`;
	}
	const diagnostic = result.diagnostics.find(candidate => candidate.severity === 'error') ?? result.diagnostics[0];
	return diagnostic?.message ?? `Scene projection did not complete: ${result.outcome ?? 'unknown outcome'}`;
}
