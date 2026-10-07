/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ProjectSummaryDto } from '../protocol/authoringProtocol';
import { ProjectRecentProjects, ProjectSessionResources } from './projectSessionLifecycle';

export const getRecentProjectsCommandId = 'jscene3d.getRecentProjects';
export const openRecentProjectCommandId = 'jscene3d.openRecentProject';

const historyVersion = 1;
const defaultHistoryLimit = 12;

/** One workspace-independent JScene3D Project history entry exposed to the Welcome editor. */
export interface ProjectRecentEntry {
	readonly projectId: string;
	readonly name: string;
	readonly descriptorUri: string;
	readonly compactPath: string;
	readonly lastOpenedAt: number;
}

/** Persistence seam for JScene3D Project history. */
export interface ProjectRecentHistoryStore {
	read(): unknown;
	write(value: unknown): Promise<void>;
}

/** Owns the bounded, stable-identity history of successfully opened JScene3D Projects. */
export class ProjectRecentHistory implements ProjectRecentProjects {
	private entriesValue: readonly ProjectRecentEntry[];

	constructor(
		private readonly store: ProjectRecentHistoryStore,
		private readonly resources: ProjectSessionResources,
		private readonly homePath: string,
		private readonly clock: () => number = Date.now,
		private readonly limit: number = defaultHistoryLimit
	) {
		this.entriesValue = parseHistory(store.read(), resources, limit);
	}

	/** Returns the most recently opened Projects, newest first. */
	entries(): readonly ProjectRecentEntry[] {
		return this.entriesValue;
	}

	/** Records one successfully opened Java-authoritative Project summary. */
	async record(project: ProjectSummaryDto): Promise<void> {
		const descriptor = this.resources.resourceForLocalPath(project.descriptor);
		if (path.extname(descriptor.fsPath).toLowerCase() !== '.j3d') {
			throw new Error('Recent Project history accepts only .j3d descriptors');
		}
		const entry: ProjectRecentEntry = {
			projectId: project.id,
			name: project.name,
			descriptorUri: descriptor.uri,
			compactPath: compactProjectPath(project.root, this.homePath),
			lastOpenedAt: this.clock()
		};
		const entries = [
			entry,
			...this.entriesValue.filter(candidate => candidate.projectId !== project.id
				&& candidate.descriptorUri !== descriptor.uri)
		].slice(0, this.limit);
		await this.store.write({ version: historyVersion, projects: entries });
		this.entriesValue = entries;
	}
}

function compactProjectPath(projectRoot: string, homePath: string): string {
	const relative = path.relative(homePath, projectRoot);
	if (relative.length === 0) {
		return '~';
	}
	if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
		return `~${path.sep}${relative}`;
	}
	return projectRoot;
}

function parseHistory(
	value: unknown,
	resources: ProjectSessionResources,
	limit: number
): readonly ProjectRecentEntry[] {
	if (!isRecord(value) || value.version !== historyVersion || !Array.isArray(value.projects)) {
		return [];
	}
	return value.projects
		.map(project => parseEntry(project, resources))
		.filter((project): project is ProjectRecentEntry => project !== undefined)
		.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
		.slice(0, limit);
}

function parseEntry(value: unknown, resources: ProjectSessionResources): ProjectRecentEntry | undefined {
	if (!isRecord(value)
		|| typeof value.projectId !== 'string' || value.projectId.length === 0
		|| typeof value.name !== 'string' || value.name.length === 0
		|| typeof value.descriptorUri !== 'string'
		|| typeof value.compactPath !== 'string' || value.compactPath.length === 0
		|| typeof value.lastOpenedAt !== 'number' || !Number.isFinite(value.lastOpenedAt)) {
		return undefined;
	}
	const descriptor = resources.parseLocalResource(value.descriptorUri);
	if (descriptor === undefined || path.extname(descriptor.fsPath).toLowerCase() !== '.j3d') {
		return undefined;
	}
	return {
		projectId: value.projectId,
		name: value.name,
		descriptorUri: value.descriptorUri,
		compactPath: value.compactPath,
		lastOpenedAt: value.lastOpenedAt
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
