/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonValue } from './messageTransport';
import { nullableInteger, nullableString, requiredArray, requiredBoolean, requiredDefinitionOrigin, requiredInteger, requiredNonEmptyString, requiredObject, requiredPositiveInteger, requiredString, requiredStringArray, requiredStringMap } from './authoringProtocolValidation';

export interface ProjectDiagnosticDto {
	readonly severity: 'error' | 'warning';
	readonly code: string;
	readonly message: string;
	readonly source: string;
	readonly location: string;
	readonly details: Readonly<Record<string, string>>;
}

/** Narrow wire summary of the configured Main Scene. */
export interface SceneSummaryDto {
	readonly id: string;
	readonly name: string;
}

/** Wire counts for authored and projected project assets. */
export interface AssetCountsDto {
	readonly authored: number;
	readonly projected: number;
}

/** One Java-classified semantic definition exposed in the Project catalog. */
export interface ProjectCatalogEntryDto {
	readonly id: string;
	readonly name: string;
	readonly source: string;
	readonly origin: 'authored' | 'generated';
	readonly editable: boolean;
	readonly mainScene: boolean;
}

/** Java-owned semantic groups displayed by the Project view. */
export interface ProjectCatalogDto {
	readonly scenes: readonly ProjectCatalogEntryDto[];
	readonly entityDefinitions: readonly ProjectCatalogEntryDto[];
}

/** Wire summary of the Java-retained authoring project. */
export interface ProjectSummaryDto {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly root: string;
	readonly descriptor: string;
	readonly mainScene: SceneSummaryDto | null;
	readonly assetCounts: AssetCountsDto;
	readonly catalog: ProjectCatalogDto;
}

/** Exact validated result for a project-open attempt, including validation diagnostics. */
export type ProjectOpenResultDto =
	| {
		readonly opened: true;
		readonly projectGeneration: number;
		readonly project: ProjectSummaryDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly opened: false;
		readonly projectGeneration: null;
		readonly project: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: string | null;
	};

/** Wire parameters for atomically replacing the retained Java project. */
export interface ProjectReplaceParamsDto {
	readonly expectedProjectGeneration: number;
	readonly path: string;
}

/** Wire result for an atomic replacement; a successful generation identifies the newly retained Java project session. */
export type ProjectReplaceResultDto =
	| {
		readonly outcome: 'replaced';
		readonly projectGeneration: number;
		readonly project: ProjectSummaryDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly outcome: 'candidateRejected';
		readonly projectGeneration: null;
		readonly project: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly outcome: 'conflict';
		readonly projectGeneration: null;
		readonly project: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: string;
	};

/** Exact validated result for invalidating the active Java project session. */
export type ProjectCloseResultDto =
	| { readonly closed: true; readonly invalidatedProjectGeneration: number }
	| { readonly closed: false; readonly invalidatedProjectGeneration: null };

/** Java-owned semantic launch specification for one isolated project renderer. */
export interface ViewportLaunchSpecificationDto {
	readonly projectGeneration: number;
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly sceneAssetId: string;
	readonly sceneName: string;
	readonly runtimeArtifacts: readonly string[];
}

/** Generation-scoped outcome of preparing a project viewport launch. */
export type ViewportLaunchResultDto =
	| {
		readonly prepared: true;
		readonly launch: ViewportLaunchSpecificationDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly prepared: false;
		readonly launch: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: string | null;
	};

/** Wire identity of one expanded Scene composition occurrence. */
export function validateProjectOpenResult(value: JsonValue): ProjectOpenResultDto {
	const object = requiredObject(value, 'project/open result');
	const opened = requiredBoolean(object.opened, 'opened');
	const generation = nullableInteger(object.projectGeneration, 'projectGeneration');
	const project = object.project === null ? null : validateProjectSummary(object.project);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	if (opened) {
		if (generation === null || project === null || failureCode !== null) {
			throw new Error('project/open result has an inconsistent success shape');
		}
		return { opened: true, projectGeneration: generation, project, diagnostics, failureCode: null };
	}
	if (generation !== null || project !== null) {
		throw new Error('project/open result has an inconsistent failure shape');
	}
	return { opened: false, projectGeneration: null, project: null, diagnostics, failureCode };
}

/** Validates all mutually exclusive project-replacement result shapes. */
export function validateProjectReplaceResult(value: JsonValue): ProjectReplaceResultDto {
	const object = requiredObject(value, 'project/replace result');
	const outcome = requiredReplaceOutcome(object.outcome);
	const generation = object.projectGeneration === null
		? null
		: requiredPositiveInteger(object.projectGeneration, 'projectGeneration');
	const project = object.project === null ? null : validateProjectSummary(object.project);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');

	if (outcome === 'replaced') {
		if (generation === null || project === null || failureCode !== null) {
			throw new Error('project/replace replaced result has an inconsistent shape');
		}
		return { outcome, projectGeneration: generation, project, diagnostics, failureCode };
	}
	if (outcome === 'candidateRejected') {
		if (generation !== null || project !== null || failureCode !== null) {
			throw new Error('project/replace candidateRejected result has an inconsistent shape');
		}
		return { outcome, projectGeneration: null, project: null, diagnostics, failureCode: null };
	}
	if (generation !== null || project !== null || failureCode === null) {
		throw new Error('project/replace conflict result has an inconsistent shape');
	}
	return { outcome, projectGeneration: null, project: null, diagnostics, failureCode };
}

/** Validates a project-close result received from Java. */
export function validateProjectCloseResult(value: JsonValue): ProjectCloseResultDto {
	const object = requiredObject(value, 'project/close result');
	const closed = requiredBoolean(object.closed, 'closed');
	const invalidatedProjectGeneration = nullableInteger(object.invalidatedProjectGeneration, 'invalidatedProjectGeneration');
	if (closed) {
		if (invalidatedProjectGeneration === null) {
			throw new Error('project/close result has an inconsistent success shape');
		}
		return { closed: true, invalidatedProjectGeneration };
	}
	if (invalidatedProjectGeneration !== null) {
		throw new Error('project/close result has an inconsistent failure shape');
	}
	return { closed: false, invalidatedProjectGeneration: null };
}

/** Validates the exact Java-owned renderer-launch result. */
export function validateViewportLaunchResult(value: JsonValue): ViewportLaunchResultDto {
	const object = requiredObject(value, 'viewport/prepareLaunch result');
	const prepared = requiredBoolean(object.prepared, 'prepared');
	const launch = object.launch === null ? null : validateViewportLaunchSpecification(object.launch);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	if (prepared) {
		if (launch === null || failureCode !== null) {
			throw new Error('viewport/prepareLaunch result has an inconsistent success shape');
		}
		return { prepared: true, launch, diagnostics, failureCode: null };
	}
	if (launch !== null) {
		throw new Error('viewport/prepareLaunch result has an inconsistent failure shape');
	}
	return { prepared: false, launch: null, diagnostics, failureCode };
}

export function validateViewportLaunchSpecification(value: JsonValue | undefined): ViewportLaunchSpecificationDto {
	const object = requiredObject(value, 'viewport launch specification');
	return {
		projectGeneration: requiredPositiveInteger(object.projectGeneration, 'projectGeneration'),
		projectId: requiredNonEmptyString(object.projectId, 'projectId'),
		projectName: requiredNonEmptyString(object.projectName, 'projectName'),
		projectRoot: requiredNonEmptyString(object.projectRoot, 'projectRoot'),
		publishedContentRoot: requiredNonEmptyString(object.publishedContentRoot, 'publishedContentRoot'),
		engineVersion: requiredNonEmptyString(object.engineVersion, 'engineVersion'),
		sceneAssetId: requiredNonEmptyString(object.sceneAssetId, 'sceneAssetId'),
		sceneName: requiredNonEmptyString(object.sceneName, 'sceneName'),
		runtimeArtifacts: requiredStringArray(object.runtimeArtifacts, 'runtimeArtifacts')
	};
}

export function validateProjectSummary(value: JsonValue | undefined): ProjectSummaryDto {
	const object = requiredObject(value, 'project');
	const mainScene = object.mainScene === null ? null : requiredObject(object.mainScene, 'mainScene');
	const validatedMainScene = mainScene === null ? null : {
		id: requiredString(mainScene.id, 'mainScene.id'),
		name: requiredString(mainScene.name, 'mainScene.name')
	};
	const assetCounts = requiredObject(object.assetCounts, 'assetCounts');
	const catalog = requiredObject(object.catalog, 'catalog');
	const scenes = requiredArray(catalog.scenes, 'catalog.scenes').map(validateProjectCatalogEntry);
	const entityDefinitions = requiredArray(catalog.entityDefinitions, 'catalog.entityDefinitions').map(validateProjectCatalogEntry);
	if (scenes.filter(entry => entry.mainScene).length > 1) {
		throw new Error('catalog.scenes cannot contain multiple Main Scenes');
	}
	if (entityDefinitions.some(entry => entry.mainScene)) {
		throw new Error('catalog.entityDefinitions cannot contain a Main Scene');
	}
	const selectedScenes = scenes.filter(entry => entry.mainScene);
	if (validatedMainScene === null && selectedScenes.length !== 0) {
		throw new Error('catalog cannot identify a Main Scene when none is configured');
	}
	if (validatedMainScene !== null
		&& (selectedScenes.length !== 1 || selectedScenes[0].id !== validatedMainScene.id)) {
		throw new Error('catalog Main Scene must match stable configured identity');
	}
	return {
		id: requiredString(object.id, 'project.id'),
		name: requiredString(object.name, 'project.name'),
		version: requiredString(object.version, 'project.version'),
		root: requiredString(object.root, 'project.root'),
		descriptor: requiredString(object.descriptor, 'project.descriptor'),
		mainScene: validatedMainScene,
		assetCounts: {
			authored: requiredInteger(assetCounts.authored, 'assetCounts.authored'),
			projected: requiredInteger(assetCounts.projected, 'assetCounts.projected')
		},
		catalog: { scenes, entityDefinitions }
	};
}

/** Validates one Java-owned semantic definition entry without deriving its kind from source layout. */
export function validateProjectCatalogEntry(value: JsonValue): ProjectCatalogEntryDto {
	const object = requiredObject(value, 'catalog entry');
	const origin = requiredDefinitionOrigin(object.origin, 'catalog entry.origin');
	const editable = requiredBoolean(object.editable, 'catalog entry.editable');
	if (origin === 'generated' && editable) {
		throw new Error('a generated catalog entry cannot be editable');
	}
	return {
		id: requiredNonEmptyString(object.id, 'catalog entry.id'),
		name: requiredNonEmptyString(object.name, 'catalog entry.name'),
		source: requiredNonEmptyString(object.source, 'catalog entry.source'),
		origin,
		editable,
		mainScene: requiredBoolean(object.mainScene, 'catalog entry.mainScene')
	};
}

/** Validates one structured Java project diagnostic. */
export function validateProjectDiagnostic(value: JsonValue): ProjectDiagnosticDto {
	const object = requiredObject(value, 'diagnostic');
	return {
		severity: requiredDiagnosticSeverity(object.severity),
		code: requiredString(object.code, 'diagnostic.code'),
		message: requiredString(object.message, 'diagnostic.message'),
		source: requiredString(object.source, 'diagnostic.source'),
		location: requiredString(object.location, 'diagnostic.location'),
		details: requiredStringMap(object.details, 'diagnostic.details')
	};
}

/** Requires one of the diagnostic severities emitted by the Stage 1 Java contract. */
export function requiredDiagnosticSeverity(value: JsonValue | undefined): ProjectDiagnosticDto['severity'] {
	if (value !== 'error' && value !== 'warning') {
		throw new Error('diagnostic.severity must be error or warning');
	}
	return value;
}

/** Requires one of the outcomes defined by the Java replacement contract. */
export function requiredReplaceOutcome(value: JsonValue | undefined): ProjectReplaceResultDto['outcome'] {
	if (value !== 'replaced' && value !== 'candidateRejected' && value !== 'conflict') {
		throw new Error('project/replace outcome is invalid');
	}
	return value;
}

/** Requires one supported structural-definition kind. */

