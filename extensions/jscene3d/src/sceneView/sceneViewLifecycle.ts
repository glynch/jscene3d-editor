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
	open(launch: SceneViewportLaunch): Promise<void>;
	update(viewportId: string, snapshot: SceneViewSnapshotDto): Promise<boolean | undefined>;
	close(viewportId: string): Promise<void>;
	publishDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void;
}

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

	async synchronize(definition: AuthoredDefinitionResource): Promise<void> {
		if (definition.snapshot.context.kind !== 'scene-definition') {
			return;
		}
		const token = (this.requestTokens.get(definition.resource) ?? 0) + 1;
		this.requestTokens.set(definition.resource, token);
		let scoped: ConnectionScopedResult<SceneViewReadResultDto>;
		try {
			scoped = await this.client.readSceneView(
				definition.projectGeneration,
				definition.assetId,
				definition.snapshot.revision
			);
		} catch (error) {
			this.logger.appendLine(`Safe Scene View projection failed: ${errorMessage(error)}`);
			return;
		}
		if (this.requestTokens.get(definition.resource) !== token) {
			return;
		}
		const result = scoped.result;
		this.host.publishDiagnostics(result.diagnostics);
		if (!result.accepted
			|| result.projectGeneration !== definition.projectGeneration
			|| result.sceneAssetId !== definition.assetId
			|| result.requestedRevision !== definition.snapshot.revision
			|| result.outcome !== 'projected'
			|| result.snapshot === null
			|| result.launch === null) {
			return;
		}

		const existing = this.sessions.get(definition.resource);
		if (existing === undefined) {
			const viewportId = this.createViewportId();
			try {
				await this.host.open({
					kind: 'scene',
					viewportId,
					connectionGeneration: scoped.connectionGeneration,
					projectGeneration: result.projectGeneration,
					sceneAssetId: result.sceneAssetId,
					snapshot: result.snapshot,
					...result.launch
				});
			} catch (error) {
				this.logger.appendLine(`Safe Scene View failed to open: ${errorMessage(error)}`);
				return;
			}
			if (this.requestTokens.get(definition.resource) !== token) {
				await this.host.close(viewportId);
				return;
			}
			this.sessions.set(definition.resource, {
				viewportId,
				connectionGeneration: scoped.connectionGeneration,
				projectGeneration: result.projectGeneration,
				sceneAssetId: result.sceneAssetId,
				revision: result.snapshot.revision
			});
			return;
		}
		if (!sameOwner(existing, scoped.connectionGeneration, result.projectGeneration, result.sceneAssetId)) {
			await this.close(definition.resource);
			return this.synchronize(definition);
		}
		if (result.snapshot.revision <= existing.revision) {
			return;
		}
		let updated: boolean | undefined;
		try {
			updated = await this.host.update(existing.viewportId, result.snapshot);
		} catch (error) {
			this.logger.appendLine(`Safe Scene View failed to update: ${errorMessage(error)}`);
			return;
		}
		if (updated === undefined) {
			this.sessions.delete(definition.resource);
			return this.synchronize(definition);
		}
		if (this.requestTokens.get(definition.resource) === token) {
			existing.revision = result.snapshot.revision;
		}
	}

	async close(resource: string): Promise<void> {
		this.requestTokens.set(resource, (this.requestTokens.get(resource) ?? 0) + 1);
		const session = this.sessions.get(resource);
		this.sessions.delete(resource);
		if (session !== undefined) {
			await this.host.close(session.viewportId);
		}
	}

	async closeAll(): Promise<void> {
		const resources = Array.from(this.sessions.keys());
		await Promise.all(resources.map(resource => this.close(resource)));
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
