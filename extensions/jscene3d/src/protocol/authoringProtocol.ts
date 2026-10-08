/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonRpcClient } from './jsonRpcClient';
import { JsonObject, JsonValue } from './messageTransport';

export const authoringProtocolVersion = { major: 1, minor: 0 } as const;

/** Single authority for method and capability names in the authoring protocol. */
export const authoringProtocolMethods = {
	initialize: 'initialize',
	openProject: 'project/open',
	replaceProject: 'project/replace',
	closeProject: 'project/close',
	prepareViewportLaunch: 'viewport/prepareLaunch',
	readSceneView: 'sceneView/read',
	openDefinition: 'definition/open',
	mutateDefinition: 'definition/mutate',
	undoDefinition: 'definition/undo',
	redoDefinition: 'definition/redo',
	saveDefinition: 'definition/save',
	revertDefinition: 'definition/revert',
	backupDefinition: 'definition/backup',
	restoreDefinitionBackup: 'definition/restoreBackup',
	readInspector: 'inspector/read',
	shutdown: 'service/shutdown'
} as const;

type AuthoringProtocolMethod = typeof authoringProtocolMethods[keyof typeof authoringProtocolMethods];
type AuthoringOperationMethod = Exclude<AuthoringProtocolMethod, typeof authoringProtocolMethods.initialize>;

const requiredAuthoringCapabilities = Object.values(authoringProtocolMethods)
	.filter((method): method is AuthoringOperationMethod => method !== authoringProtocolMethods.initialize);

/** Wire representation of the exact internal authoring protocol version. */
export interface ProtocolVersionDto {
	readonly major: number;
	readonly minor: number;
}

/** Wire result returned by the authoring service during initialization. */
export interface InitializeResultDto {
	readonly protocolVersion: ProtocolVersionDto;
	readonly contractIdentity: string;
	readonly buildIdentity: string;
	readonly processKind: string;
	readonly serviceVersion: string;
	readonly engineVersion: string;
	readonly capabilities: readonly string[];
}

/** Wire representation of one Java-owned project diagnostic. */
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
export interface SceneViewOccurrenceDto {
	readonly rootDefinitionAssetId: string;
	readonly entityPath: readonly string[];
}

/** Wire definition scope that owns a projected component. */
export interface SceneViewScopeDto {
	readonly definitionAssetId: string;
	readonly anchor: SceneViewOccurrenceDto;
}

/** Wire reverse-lookup identity for one projected built-in component. */
export interface SceneViewComponentIdentityDto {
	readonly occurrence: SceneViewOccurrenceDto;
	readonly scope: SceneViewScopeDto;
	readonly authoredEntityId: string;
	readonly componentId: string;
}

/** Exact decimal three-component vector on the authoring wire. */
export interface SceneViewVector3Dto {
	readonly x: string;
	readonly y: string;
	readonly z: string;
}

/** Unrealized renderer-resource reference on the authoring wire. */
export interface SceneViewResourceReferenceDto {
	readonly kind: 'project' | 'asset' | 'import';
	readonly locator: string;
	readonly projectPath: string | null;
}

/** Complete built-in visual state for one expanded Scene occurrence. */
export interface SceneViewVisualOccurrenceDto {
	readonly occurrence: SceneViewOccurrenceDto;
	readonly parent: SceneViewOccurrenceDto | null;
	readonly authoredAssetId: string;
	readonly authoredSource: string;
	readonly authoredEntityId: string;
	readonly name: string | null;
	readonly enabled: boolean;
	readonly transform: {
		readonly identity: SceneViewComponentIdentityDto;
		readonly position: SceneViewVector3Dto;
		readonly orientationDegrees: SceneViewVector3Dto;
		readonly scale: SceneViewVector3Dto;
	} | null;
	readonly meshes: readonly {
		readonly identity: SceneViewComponentIdentityDto;
		readonly mesh: SceneViewResourceReferenceDto;
		readonly material: SceneViewResourceReferenceDto;
		readonly visible: boolean;
	}[];
	readonly directionalLight: {
		readonly identity: SceneViewComponentIdentityDto;
		readonly color: SceneViewVector3Dto;
		readonly intensity: string;
		readonly target: SceneViewVector3Dto;
	} | null;
}

/** Complete Java-owned safe projection for one authored Scene revision. */
export interface SceneViewSnapshotDto {
	readonly sceneAssetId: string;
	readonly revision: number;
	readonly occurrences: readonly SceneViewVisualOccurrenceDto[];
}

/** Product-owned renderer context containing no title runtime artifacts. */
export interface SceneViewLaunchSpecificationDto {
	readonly projectId: string;
	readonly projectName: string;
	readonly projectRoot: string;
	readonly publishedContentRoot: string;
	readonly engineVersion: string;
	readonly sceneName: string;
}

/** Exact revision-scoped outcome returned by `sceneView/read`. */
export type SceneViewReadResultDto =
	| {
		readonly accepted: true;
		readonly projectGeneration: number;
		readonly sceneAssetId: string;
		readonly requestedRevision: number;
		readonly outcome: 'projected' | 'scene-unavailable' | 'stale-revision' | 'planning-failed' | 'projection-failed';
		readonly currentRevision: number | null;
		readonly snapshot: SceneViewSnapshotDto | null;
		readonly launch: SceneViewLaunchSpecificationDto | null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly accepted: false;
		readonly projectGeneration: null;
		readonly sceneAssetId: string;
		readonly requestedRevision: number;
		readonly outcome: null;
		readonly currentRevision: null;
		readonly snapshot: null;
		readonly launch: null;
		readonly diagnostics: readonly [];
		readonly failureCode: string;
	};

/** Authored literal or Java-owned localizable semantic text. */
export interface AuthoringTextDto {
	readonly kind: 'literal' | 'message';
	readonly text: string;
	readonly messageCode: string | null;
	readonly arguments: readonly string[];
}

/** Stable hierarchy occurrence identity within one containing definition. */
export interface HierarchyOccurrenceDto {
	readonly definitionAssetId: string;
	readonly entityPath: readonly string[];
}

/** Semantic target retained for a future Inspector without transferring UI selection to Java. */
export interface HierarchySemanticTargetDto {
	readonly kind: 'scene' | 'local-entity' | 'generated-entity' | 'placement' | 'asset';
	readonly source: string;
	readonly identity: string;
	readonly occurrence: HierarchyOccurrenceDto | null;
}

/** One recursively ordered semantic hierarchy occurrence. */
export interface HierarchyNodeDto {
	readonly occurrence: HierarchyOccurrenceDto;
	readonly kind: 'local-entity' | 'placement' | 'generated-entity';
	readonly entityId: string | null;
	readonly definitionId: string | null;
	readonly label: AuthoringTextDto;
	readonly enabled: boolean;
	readonly modified: boolean;
	readonly editable: boolean;
	readonly target: HierarchySemanticTargetDto;
	readonly children: readonly HierarchyNodeDto[];
}

/** Definition/document context kept separate from actual hierarchy roots. */
export interface DefinitionContextDto {
	readonly assetId: string;
	readonly kind: 'scene-definition' | 'entity-definition';
	readonly origin: 'authored' | 'generated';
	readonly editable: boolean;
	readonly source: string;
	readonly label: AuthoringTextDto;
}

/** Complete authoritative snapshot returned when one structural definition is retained. */
export interface DefinitionSnapshotDto {
	readonly revision: number;
	readonly context: DefinitionContextDto;
	readonly roots: readonly HierarchyNodeDto[];
}

/** Exact generation-scoped result for opening one structural definition by AssetId. */
export type DefinitionOpenResultDto =
	| {
		readonly opened: true;
		readonly projectGeneration: number;
		readonly definition: DefinitionSnapshotDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: null;
	}
	| {
		readonly opened: false;
		readonly projectGeneration: null;
		readonly definition: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: string | null;
	};

/** Associates one validated authoring operation result with its owning Java connection generation. */
export interface ConnectionScopedResult<T> {
	readonly connectionGeneration: string;
	readonly result: T;
}

export type ProjectValueKindDto = 'null' | 'boolean' | 'number' | 'text' | 'array' | 'object'
	| 'reference' | 'entity-target' | 'component-target';

export interface InspectorComponentTypeDto {
	readonly id: string;
	readonly version: number;
}

export type InspectorValueDto =
	| { readonly kind: 'null' }
	| { readonly kind: 'boolean'; readonly value: boolean }
	| { readonly kind: 'number'; readonly decimal: string }
	| { readonly kind: 'text'; readonly value: string }
	| { readonly kind: 'array'; readonly values: readonly InspectorValueDto[] }
	| { readonly kind: 'object'; readonly values: Readonly<Record<string, InspectorValueDto>> }
	| {
		readonly kind: 'reference'; readonly referenceKind: 'project' | 'asset' | 'import';
		readonly locator: string; readonly label: string; readonly resolution: 'resolved' | 'broken';
		readonly revealUri: string | null;
	}
	| {
		readonly kind: 'entity-target'; readonly entityId: string; readonly label: string;
		readonly resolution: 'resolved' | 'broken'; readonly occurrence: HierarchyOccurrenceDto | null;
	}
	| {
		readonly kind: 'component-target'; readonly entityId: string; readonly componentId: string;
		readonly entityLabel: string; readonly componentLabel: string;
		readonly componentType: InspectorComponentTypeDto | null; readonly resolution: 'resolved' | 'broken';
		readonly occurrence: HierarchyOccurrenceDto | null;
	};

export type InspectorMutationTargetDto =
	| {
		readonly kind: 'entity-enabled'; readonly occurrence: HierarchyOccurrenceDto; readonly entityId: string;
	}
	| {
		readonly kind: 'component-property'; readonly occurrence: HierarchyOccurrenceDto; readonly entityId: string;
		readonly componentId: string; readonly propertyId: string;
	};

/** Exact scalar candidate accepted by the first editable Inspector slice. */
export type DefinitionMutationValueDto =
	| { readonly kind: 'boolean'; readonly value: boolean }
	| { readonly kind: 'integer' | 'number' | 'text'; readonly literal: string };

/** Permanent authored mutation vocabulary. */
export type DefinitionMutationDto =
	| { readonly operation: 'set'; readonly value: DefinitionMutationValueDto }
	| { readonly operation: 'remove' };

/** Authoritative state returned after mutation, history, persistence, or recovery. */
export interface DefinitionOperationResultDto {
	readonly definition: string;
	readonly outcome: string;
	readonly revision: number;
	readonly dirty: boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly diagnostics: readonly ProjectDiagnosticDto[];
}

/** Authoritative recovery capture with opaque Java-produced bytes. */
export interface DefinitionBackupResultDto {
	readonly definition: string;
	readonly outcome: string;
	readonly revision: number;
	readonly dirty: boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly backup: string | null;
}

export interface InspectorNumericBoundDto {
	readonly decimal: string;
	readonly inclusive: boolean;
}

export interface InspectorEditorSemanticsDto {
	readonly semantic: 'default' | 'integer' | 'vector2' | 'vector3' | 'euler-rotation' | 'quaternion' | 'color-linear';
	readonly minimum: InspectorNumericBoundDto | null;
	readonly maximum: InspectorNumericBoundDto | null;
}

export interface InspectorConstraintsDto {
	readonly elementKind: ProjectValueKindDto | null;
	readonly exactElementCount: number | null;
	readonly acceptedReferenceKinds: readonly ('project' | 'asset' | 'import')[];
	readonly editor: InspectorEditorSemanticsDto;
}

export interface InspectorPropertyStateDto {
	readonly authoredValue: InspectorValueDto | null;
	readonly defaultValue: InspectorValueDto | null;
	readonly effectiveValue: InspectorValueDto | null;
	readonly origin: 'authored' | 'default' | 'unset';
	readonly validity: 'valid' | 'required-unset' | 'broken-reference' | 'metadata-unavailable';
	readonly editable: boolean;
	readonly modified: boolean;
}

export interface InspectorPropertyDto {
	readonly identity: string;
	readonly label: string;
	readonly description: string | null;
	readonly valueKind: ProjectValueKindDto;
	readonly required: boolean;
	readonly constraints: InspectorConstraintsDto;
	readonly state: InspectorPropertyStateDto;
	readonly mutationTarget: InspectorMutationTargetDto | null;
}

export interface InspectorTargetGroupDto {
	readonly identity: string;
	readonly kind: 'entity' | 'component' | 'placement';
	readonly label: string;
	readonly description: string | null;
	readonly componentId: string | null;
	readonly componentType: InspectorComponentTypeDto | null;
	readonly metadataStatus: 'available' | 'unavailable';
	readonly editable: boolean;
	readonly properties: readonly InspectorPropertyDto[];
}

export interface InspectorSnapshotDto {
	readonly revision: number;
	readonly target: HierarchySemanticTargetDto;
	readonly title: string;
	readonly definitionOrigin: 'authored' | 'generated';
	readonly provenance: 'local' | 'generated';
	readonly editable: boolean;
	readonly groups: readonly InspectorTargetGroupDto[];
}

export type InspectorReadResultDto =
	| {
		readonly read: true; readonly projectGeneration: number; readonly snapshot: InspectorSnapshotDto;
		readonly diagnostics: readonly ProjectDiagnosticDto[]; readonly failureCode: null;
	}
	| {
		readonly read: false; readonly projectGeneration: null; readonly snapshot: null;
		readonly diagnostics: readonly ProjectDiagnosticDto[]; readonly failureCode: string;
	};

/** Wire acknowledgement of process shutdown. */
export interface ShutdownResultDto {
	readonly shutdown: boolean;
}

/** Typed Stage 1 protocol operations with initialization and generation checks. */
export class AuthoringProtocolClient {
	private connectionGeneration: string | undefined;

	constructor(private readonly rpc: JsonRpcClient) { }

	onDidFail(listener: (error: Error) => void): { dispose(): void } {
		return this.rpc.onDidFail(listener);
	}

	async initialize(clientLanguage: string, contractIdentity: string, buildIdentity: string): Promise<InitializeResultDto> {
		const response = await this.rpc.request(authoringProtocolMethods.initialize, {
			protocolVersion: authoringProtocolVersion,
			contractIdentity: requiredNonBlankIdentity(contractIdentity, 'contractIdentity'),
			buildIdentity: requiredNonBlankIdentity(buildIdentity, 'buildIdentity'),
			clientLanguage: requiredLanguageTag(clientLanguage)
		}, validateInitializeResult);
		const result = response.result;
		if (result.protocolVersion.major !== authoringProtocolVersion.major
			|| result.protocolVersion.minor !== authoringProtocolVersion.minor) {
			throw new Error(`Incompatible authoring protocol ${result.protocolVersion.major}.${result.protocolVersion.minor}`);
		}
		if (result.contractIdentity !== contractIdentity) {
			throw new Error(`Incompatible authoring contract ${result.contractIdentity}; expected ${contractIdentity}`);
		}
		if (result.buildIdentity !== buildIdentity) {
			throw new Error(`Stale authoring build ${result.buildIdentity}; expected ${buildIdentity}`);
		}
		if (result.processKind !== 'authoring') {
			throw new Error(`Expected an authoring service but received process kind ${result.processKind}`);
		}
		for (const capability of requiredAuthoringCapabilities) {
			if (!result.capabilities.includes(capability)) {
				throw new Error(`Authoring service does not provide required capability ${capability}`);
			}
		}
		this.connectionGeneration = response.connectionGeneration;
		return result;
	}

	async openProject(path: string): Promise<ProjectOpenResultDto> {
		return (await this.request(authoringProtocolMethods.openProject, { path }, validateProjectOpenResult)).result;
	}

	async replaceProject(expectedProjectGeneration: number, path: string): Promise<ProjectReplaceResultDto> {
		const params: ProjectReplaceParamsDto = {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			path
		};
		return (await this.request(authoringProtocolMethods.replaceProject, {
			expectedProjectGeneration: params.expectedProjectGeneration,
			path: params.path
		}, validateProjectReplaceResult)).result;
	}

	async closeProject(): Promise<ProjectCloseResultDto> {
		return (await this.request(authoringProtocolMethods.closeProject, {}, validateProjectCloseResult)).result;
	}

	async prepareViewportLaunch(
		expectedProjectGeneration: number,
		sceneAssetId: string
	): Promise<ConnectionScopedResult<ViewportLaunchResultDto>> {
		return this.request(authoringProtocolMethods.prepareViewportLaunch, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			sceneAssetId: requiredNonEmptyString(sceneAssetId, 'sceneAssetId')
		}, validateViewportLaunchResult);
	}

	async readSceneView(
		expectedProjectGeneration: number,
		sceneAssetId: string,
		expectedDefinitionRevision: number
	): Promise<ConnectionScopedResult<SceneViewReadResultDto>> {
		return this.request(authoringProtocolMethods.readSceneView, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			sceneAssetId: requiredNonEmptyString(sceneAssetId, 'sceneAssetId'),
			expectedDefinitionRevision: requiredInteger(expectedDefinitionRevision, 'expectedDefinitionRevision')
		}, validateSceneViewReadResult);
	}

	async openDefinition(
		expectedProjectGeneration: number,
		assetId: string
	): Promise<ConnectionScopedResult<DefinitionOpenResultDto>> {
		return this.request(authoringProtocolMethods.openDefinition, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			assetId: requiredNonEmptyString(assetId, 'assetId')
		}, validateDefinitionOpenResult);
	}

	async mutateDefinition(
		expectedProjectGeneration: number,
		assetId: string,
		expectedDefinitionRevision: number,
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto
	): Promise<DefinitionOperationResultDto> {
		return (await this.request(authoringProtocolMethods.mutateDefinition, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			assetId: requiredNonEmptyString(assetId, 'assetId'),
			expectedDefinitionRevision: requiredInteger(expectedDefinitionRevision, 'expectedDefinitionRevision'),
			operation: mutation.operation,
			target: mutationTargetJson(target),
			value: mutation.operation === 'set' ? mutationValueJson(mutation.value) : null
		}, validateDefinitionOperationResult)).result;
	}

	undoDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		return this.definitionOperation(authoringProtocolMethods.undoDefinition, projectGeneration, assetId, revision);
	}

	redoDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		return this.definitionOperation(authoringProtocolMethods.redoDefinition, projectGeneration, assetId, revision);
	}

	saveDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		return this.definitionOperation(authoringProtocolMethods.saveDefinition, projectGeneration, assetId, revision);
	}

	revertDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionOperationResultDto> {
		return this.definitionOperation(authoringProtocolMethods.revertDefinition, projectGeneration, assetId, revision);
	}

	async backupDefinition(projectGeneration: number, assetId: string, revision: number): Promise<DefinitionBackupResultDto> {
		return (await this.request(authoringProtocolMethods.backupDefinition,
			definitionOperationParams(projectGeneration, assetId, revision), validateDefinitionBackupResult)).result;
	}

	async restoreDefinitionBackup(
		projectGeneration: number,
		assetId: string,
		revision: number,
		backup: string
	): Promise<DefinitionOperationResultDto> {
		return (await this.request(authoringProtocolMethods.restoreDefinitionBackup, {
			...definitionOperationParams(projectGeneration, assetId, revision),
			backup: requiredNonEmptyString(backup, 'backup')
		}, validateDefinitionOperationResult)).result;
	}

	async readInspector(
		expectedProjectGeneration: number,
		expectedDefinitionRevision: number,
		target: HierarchySemanticTargetDto
	): Promise<InspectorReadResultDto> {
		return (await this.request(authoringProtocolMethods.readInspector, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			expectedDefinitionRevision: requiredInteger(expectedDefinitionRevision, 'expectedDefinitionRevision'),
			target: semanticTargetJson(target)
		}, validateInspectorReadResult)).result;
	}

	async shutdown(): Promise<ShutdownResultDto> {
		return (await this.request(authoringProtocolMethods.shutdown, {}, validateShutdownResult)).result;
	}

	dispose(): void {
		this.rpc.dispose();
	}

	private async request<T>(method: AuthoringOperationMethod, params: JsonObject, validate: (value: JsonValue) => T) {
		if (this.connectionGeneration === undefined) {
			throw new Error('Authoring service has not been initialized');
		}
		const response = await this.rpc.request(method, params, validate);
		if (response.connectionGeneration !== this.connectionGeneration) {
			throw new Error('Authoring service connection generation changed unexpectedly');
		}
		return response;
	}

	private async definitionOperation(
		method: typeof authoringProtocolMethods.undoDefinition
			| typeof authoringProtocolMethods.redoDefinition
			| typeof authoringProtocolMethods.saveDefinition
			| typeof authoringProtocolMethods.revertDefinition,
		projectGeneration: number,
		assetId: string,
		revision: number
	): Promise<DefinitionOperationResultDto> {
		return (await this.request(method, definitionOperationParams(projectGeneration, assetId, revision),
			validateDefinitionOperationResult)).result;
	}
}

/** Validates an initialize result received from Java. */
function validateInitializeResult(value: JsonValue): InitializeResultDto {
	const object = requiredObject(value, 'initialize result');
	return {
		protocolVersion: validateProtocolVersion(object.protocolVersion),
		contractIdentity: requiredString(object.contractIdentity, 'contractIdentity'),
		buildIdentity: requiredString(object.buildIdentity, 'buildIdentity'),
		processKind: requiredString(object.processKind, 'processKind'),
		serviceVersion: requiredString(object.serviceVersion, 'serviceVersion'),
		engineVersion: requiredString(object.engineVersion, 'engineVersion'),
		capabilities: requiredStringArray(object.capabilities, 'capabilities')
	};
}

/** Validates a project-open result received from Java. */
function validateProjectOpenResult(value: JsonValue): ProjectOpenResultDto {
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
function validateProjectReplaceResult(value: JsonValue): ProjectReplaceResultDto {
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
function validateProjectCloseResult(value: JsonValue): ProjectCloseResultDto {
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
function validateViewportLaunchResult(value: JsonValue): ViewportLaunchResultDto {
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

function validateViewportLaunchSpecification(value: JsonValue | undefined): ViewportLaunchSpecificationDto {
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

function validateSceneViewReadResult(value: JsonValue): SceneViewReadResultDto {
	const object = requiredObject(value, 'sceneView/read result');
	const accepted = requiredBoolean(object.accepted, 'accepted');
	const projectGeneration = nullableInteger(object.projectGeneration, 'projectGeneration');
	const sceneAssetId = requiredNonEmptyString(object.sceneAssetId, 'sceneAssetId');
	const requestedRevision = requiredInteger(object.requestedRevision, 'requestedRevision');
	const outcome = object.outcome === null ? null : requiredSceneViewOutcome(object.outcome);
	const currentRevision = nullableInteger(object.currentRevision, 'currentRevision');
	const snapshot = object.snapshot === null ? null : validateSceneViewSnapshot(object.snapshot);
	const launch = object.launch === null ? null : validateSceneViewLaunch(object.launch);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	if (!accepted) {
		if (projectGeneration !== null || outcome !== null || currentRevision !== null || snapshot !== null
			|| launch !== null || diagnostics.length !== 0 || failureCode === null) {
			throw new Error('sceneView/read result has an inconsistent rejection shape');
		}
		return { accepted: false, projectGeneration: null, sceneAssetId, requestedRevision, outcome: null,
			currentRevision: null, snapshot: null, launch: null, diagnostics: [], failureCode };
	}
	if (projectGeneration === null || outcome === null || failureCode !== null) {
		throw new Error('sceneView/read result has an inconsistent accepted shape');
	}
	const projected = outcome === 'projected';
	if (projected !== (snapshot !== null && launch !== null)
		|| (snapshot !== null && (snapshot.sceneAssetId !== sceneAssetId || snapshot.revision !== currentRevision))) {
		throw new Error('sceneView/read projected result has an inconsistent identity');
	}
	return { accepted: true, projectGeneration, sceneAssetId, requestedRevision, outcome, currentRevision,
		snapshot, launch, diagnostics, failureCode: null };
}

function validateSceneViewSnapshot(value: JsonValue | undefined): SceneViewSnapshotDto {
	const object = requiredObject(value, 'Scene View snapshot');
	return {
		sceneAssetId: requiredNonEmptyString(object.sceneAssetId, 'Scene View sceneAssetId'),
		revision: requiredInteger(object.revision, 'Scene View revision'),
		occurrences: requiredArray(object.occurrences, 'Scene View occurrences').map(validateSceneViewVisualOccurrence)
	};
}

function validateSceneViewVisualOccurrence(value: JsonValue): SceneViewVisualOccurrenceDto {
	const object = requiredObject(value, 'Scene View visual occurrence');
	return {
		occurrence: validateSceneViewOccurrence(object.occurrence),
		parent: object.parent === null ? null : validateSceneViewOccurrence(object.parent),
		authoredAssetId: requiredNonEmptyString(object.authoredAssetId, 'authoredAssetId'),
		authoredSource: requiredNonEmptyString(object.authoredSource, 'authoredSource'),
		authoredEntityId: requiredNonEmptyString(object.authoredEntityId, 'authoredEntityId'),
		name: nullableString(object.name, 'name'),
		enabled: requiredBoolean(object.enabled, 'enabled'),
		transform: object.transform === null ? null : validateSceneViewTransform(object.transform),
		meshes: requiredArray(object.meshes, 'meshes').map(validateSceneViewMesh),
		directionalLight: object.directionalLight === null ? null : validateSceneViewDirectionalLight(object.directionalLight)
	};
}

function validateSceneViewOccurrence(value: JsonValue | undefined): SceneViewOccurrenceDto {
	const object = requiredObject(value, 'Scene View occurrence');
	return {
		rootDefinitionAssetId: requiredNonEmptyString(object.rootDefinitionAssetId, 'rootDefinitionAssetId'),
		entityPath: requiredStringArray(object.entityPath, 'entityPath')
	};
}

function validateSceneViewComponentIdentity(value: JsonValue | undefined): SceneViewComponentIdentityDto {
	const object = requiredObject(value, 'Scene View component identity');
	const scope = requiredObject(object.scope, 'Scene View scope');
	return {
		occurrence: validateSceneViewOccurrence(object.occurrence),
		scope: {
			definitionAssetId: requiredNonEmptyString(scope.definitionAssetId, 'definitionAssetId'),
			anchor: validateSceneViewOccurrence(scope.anchor)
		},
		authoredEntityId: requiredNonEmptyString(object.authoredEntityId, 'authoredEntityId'),
		componentId: requiredNonEmptyString(object.componentId, 'componentId')
	};
}

function validateSceneViewVector(value: JsonValue | undefined): SceneViewVector3Dto {
	const object = requiredObject(value, 'Scene View vector');
	return {
		x: requiredDecimal(object.x, 'x'),
		y: requiredDecimal(object.y, 'y'),
		z: requiredDecimal(object.z, 'z')
	};
}

function validateSceneViewTransform(value: JsonValue | undefined): NonNullable<SceneViewVisualOccurrenceDto['transform']> {
	const object = requiredObject(value, 'Scene View transform');
	return {
		identity: validateSceneViewComponentIdentity(object.identity),
		position: validateSceneViewVector(object.position),
		orientationDegrees: validateSceneViewVector(object.orientationDegrees),
		scale: validateSceneViewVector(object.scale)
	};
}

function validateSceneViewResource(value: JsonValue | undefined): SceneViewResourceReferenceDto {
	const object = requiredObject(value, 'Scene View resource');
	const kind = requiredReferenceKind(object.kind);
	const projectPath = nullableString(object.projectPath, 'projectPath');
	if ((kind === 'project') !== (projectPath !== null)) {
		throw new Error('Scene View project resource path is inconsistent');
	}
	return { kind, locator: requiredNonEmptyString(object.locator, 'locator'), projectPath };
}

function validateSceneViewMesh(value: JsonValue): SceneViewVisualOccurrenceDto['meshes'][number] {
	const object = requiredObject(value, 'Scene View mesh');
	return {
		identity: validateSceneViewComponentIdentity(object.identity),
		mesh: validateSceneViewResource(object.mesh),
		material: validateSceneViewResource(object.material),
		visible: requiredBoolean(object.visible, 'visible')
	};
}

function validateSceneViewDirectionalLight(value: JsonValue | undefined): NonNullable<SceneViewVisualOccurrenceDto['directionalLight']> {
	const object = requiredObject(value, 'Scene View directional light');
	return {
		identity: validateSceneViewComponentIdentity(object.identity),
		color: validateSceneViewVector(object.color),
		intensity: requiredDecimal(object.intensity, 'intensity'),
		target: validateSceneViewVector(object.target)
	};
}

function validateSceneViewLaunch(value: JsonValue | undefined): SceneViewLaunchSpecificationDto {
	const object = requiredObject(value, 'Scene View launch');
	return {
		projectId: requiredNonEmptyString(object.projectId, 'projectId'),
		projectName: requiredNonEmptyString(object.projectName, 'projectName'),
		projectRoot: requiredNonEmptyString(object.projectRoot, 'projectRoot'),
		publishedContentRoot: requiredNonEmptyString(object.publishedContentRoot, 'publishedContentRoot'),
		engineVersion: requiredNonEmptyString(object.engineVersion, 'engineVersion'),
		sceneName: requiredNonEmptyString(object.sceneName, 'sceneName')
	};
}

function requiredSceneViewOutcome(value: JsonValue | undefined): NonNullable<Extract<SceneViewReadResultDto, { accepted: true }>['outcome']> {
	const outcome = requiredString(value, 'Scene View outcome');
	if (outcome !== 'projected' && outcome !== 'scene-unavailable' && outcome !== 'stale-revision'
		&& outcome !== 'planning-failed' && outcome !== 'projection-failed') {
		throw new Error('Scene View outcome is invalid');
	}
	return outcome;
}

/** Validates a complete generation-scoped retained-definition snapshot. */
function validateDefinitionOpenResult(value: JsonValue): DefinitionOpenResultDto {
	const object = requiredObject(value, 'definition/open result');
	const opened = requiredBoolean(object.opened, 'opened');
	const generation = nullableInteger(object.projectGeneration, 'projectGeneration');
	const definition = object.definition === null ? null : validateDefinitionSnapshot(object.definition);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	if (opened) {
		if (generation === null || definition === null || failureCode !== null) {
			throw new Error('definition/open result has an inconsistent success shape');
		}
		return { opened: true, projectGeneration: generation, definition, diagnostics, failureCode: null };
	}
	if (generation !== null || definition !== null) {
		throw new Error('definition/open result has an inconsistent failure shape');
	}
	return { opened: false, projectGeneration: null, definition: null, diagnostics, failureCode };
}

/** Validates the exact discriminated Inspector read result. */
function validateInspectorReadResult(value: JsonValue): InspectorReadResultDto {
	const object = requiredObject(value, 'inspector/read result');
	const read = requiredBoolean(object.read, 'read');
	const generation = nullableInteger(object.projectGeneration, 'projectGeneration');
	const snapshot = object.snapshot === null ? null : validateInspectorSnapshot(object.snapshot);
	const diagnostics = requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic);
	const failureCode = nullableString(object.failureCode, 'failureCode');
	if (read) {
		if (generation === null || snapshot === null || failureCode !== null) {
			throw new Error('inspector/read result has an inconsistent success shape');
		}
		return { read: true, projectGeneration: generation, snapshot, diagnostics, failureCode: null };
	}
	if (generation !== null || snapshot !== null || failureCode === null || failureCode.length === 0) {
		throw new Error('inspector/read result has an inconsistent rejection shape');
	}
	return { read: false, projectGeneration: null, snapshot: null, diagnostics, failureCode };
}

/** Validates one complete immutable Inspector snapshot. */
function validateInspectorSnapshot(value: JsonValue | undefined): InspectorSnapshotDto {
	const object = requiredObject(value, 'inspector snapshot');
	const target = validateSemanticTarget(object.target);
	if (target.occurrence === null) {
		throw new Error('Inspector target must contain a hierarchy occurrence');
	}
	const groups = requiredArray(object.groups, 'inspector groups').map(validateInspectorGroup);
	const identities = new Set(groups.map(group => group.identity));
	if (identities.size !== groups.length) {
		throw new Error('Inspector group identities must be unique');
	}
	const editable = requiredBoolean(object.editable, 'inspector editable');
	if (!editable && groups.some(group => group.editable || group.properties.some(property => property.state.editable))) {
		throw new Error('A read-only Inspector snapshot cannot contain editable groups or properties');
	}
	return {
		revision: requiredInteger(object.revision, 'inspector revision'),
		target,
		title: requiredString(object.title, 'inspector title'),
		definitionOrigin: requiredDefinitionOrigin(object.definitionOrigin),
		provenance: requiredInspectorProvenance(object.provenance),
		editable,
		groups
	};
}

/** Validates one selectable Inspector target group. */
function validateInspectorGroup(value: JsonValue): InspectorTargetGroupDto {
	const object = requiredObject(value, 'Inspector group');
	const kind = requiredInspectorGroupKind(object.kind);
	const componentId = nullableString(object.componentId, 'Inspector group componentId');
	const componentType = object.componentType === null ? null : validateInspectorComponentType(object.componentType);
	if ((componentId === null) !== (componentType === null) || (kind === 'component') !== (componentId !== null)) {
		throw new Error('Inspector component group identity is inconsistent');
	}
	const properties = requiredArray(object.properties, 'Inspector group properties').map(validateInspectorProperty);
	if (new Set(properties.map(property => property.identity)).size !== properties.length) {
		throw new Error('Inspector property identities must be unique within a group');
	}
	const metadataStatus = requiredMetadataStatus(object.metadataStatus);
	const editable = requiredBoolean(object.editable, 'Inspector group editable');
	if (!editable && properties.some(property => property.state.editable)) {
		throw new Error('A read-only Inspector group cannot contain editable properties');
	}
	if (metadataStatus === 'unavailable'
		&& (editable || properties.some(property => property.state.validity !== 'metadata-unavailable'))) {
		throw new Error('An Inspector group without metadata must remain visible and read-only');
	}
	return {
		identity: requiredNonEmptyString(object.identity, 'Inspector group identity'),
		kind,
		label: requiredString(object.label, 'Inspector group label'),
		description: nullableString(object.description, 'Inspector group description'),
		componentId,
		componentType,
		metadataStatus,
		editable,
		properties
	};
}

/** Validates one exact component type. */
function validateInspectorComponentType(value: JsonValue | undefined): InspectorComponentTypeDto {
	const object = requiredObject(value, 'Inspector component type');
	return {
		id: requiredNonEmptyString(object.id, 'Inspector component type id'),
		version: requiredPositiveInteger(object.version, 'Inspector component type version')
	};
}

/** Validates one Inspector property and cross-field invariants. */
function validateInspectorProperty(value: JsonValue): InspectorPropertyDto {
	const object = requiredObject(value, 'Inspector property');
	const valueKind = requiredProjectValueKind(object.valueKind);
	const constraints = validateInspectorConstraints(object.constraints, valueKind);
	const state = validateInspectorPropertyState(object.state, valueKind, constraints);
	const required = requiredBoolean(object.required, 'Inspector property required');
	if (state.validity === 'required-unset' && (!required || state.effectiveValue !== null)) {
		throw new Error('Required-unset validity requires a required property without an effective value');
	}
	const mutationTarget = object.mutationTarget === null ? null : validateInspectorMutationTarget(object.mutationTarget);
	if (state.editable !== (mutationTarget !== null)) {
		throw new Error('Inspector property editability must match mutation identity');
	}
	return {
		identity: requiredNonEmptyString(object.identity, 'Inspector property identity'),
		label: requiredString(object.label, 'Inspector property label'),
		description: nullableString(object.description, 'Inspector property description'),
		valueKind,
		required,
		constraints,
		state,
		mutationTarget
	};
}

/** Validates structural constraints and the closed typed semantic vocabulary. */
function validateInspectorConstraints(value: JsonValue | undefined, valueKind: ProjectValueKindDto): InspectorConstraintsDto {
	const object = requiredObject(value, 'Inspector constraints');
	const elementKind = object.elementKind === null ? null : requiredProjectValueKind(object.elementKind);
	const exactElementCount = object.exactElementCount === null
		? null
		: requiredPositiveInteger(object.exactElementCount, 'Inspector exactElementCount');
	if (valueKind !== 'array' && (elementKind !== null || exactElementCount !== null)) {
		throw new Error('Only arrays can declare element constraints');
	}
	const acceptedReferenceKinds = requiredArray(object.acceptedReferenceKinds, 'acceptedReferenceKinds')
		.map(requiredReferenceKind);
	if (valueKind !== 'reference' && acceptedReferenceKinds.length !== 0) {
		throw new Error('Only reference properties can declare accepted reference kinds');
	}
	const editor = validateInspectorEditor(object.editor);
	if (valueKind !== 'number' && (editor.minimum !== null || editor.maximum !== null)) {
		throw new Error('Only number properties can declare numeric bounds');
	}
	validateEditorShape(editor.semantic, valueKind, elementKind, exactElementCount);
	return { elementKind, exactElementCount, acceptedReferenceKinds, editor };
}

/** Validates one closed typed editor-semantic description. */
function validateInspectorEditor(value: JsonValue | undefined): InspectorEditorSemanticsDto {
	const object = requiredObject(value, 'Inspector editor semantics');
	return {
		semantic: requiredEditorSemantic(object.semantic),
		minimum: object.minimum === null ? null : validateNumericBound(object.minimum),
		maximum: object.maximum === null ? null : validateNumericBound(object.maximum)
	};
}

function validateNumericBound(value: JsonValue | undefined): InspectorNumericBoundDto {
	const object = requiredObject(value, 'Inspector numeric bound');
	return {
		decimal: requiredDecimal(object.decimal, 'Inspector numeric bound decimal'),
		inclusive: requiredBoolean(object.inclusive, 'Inspector numeric bound inclusive')
	};
}

/** Validates authored/default/effective state without collapsing origin, validity, and editability. */
function validateInspectorPropertyState(
	value: JsonValue | undefined,
	valueKind: ProjectValueKindDto,
	constraints: InspectorConstraintsDto
): InspectorPropertyStateDto {
	const object = requiredObject(value, 'Inspector property state');
	const authoredValue = object.authoredValue === null ? null : validateInspectorValue(object.authoredValue);
	const defaultValue = object.defaultValue === null ? null : validateInspectorValue(object.defaultValue);
	const effectiveValue = object.effectiveValue === null ? null : validateInspectorValue(object.effectiveValue);
	const origin = requiredPropertyOrigin(object.origin);
	if ((origin === 'authored' && (authoredValue === null || effectiveValue === null))
		|| (origin === 'default' && (authoredValue !== null || defaultValue === null || effectiveValue === null))
		|| (origin === 'unset' && (authoredValue !== null || effectiveValue !== null))) {
		throw new Error('Inspector property origin is inconsistent with projected values');
	}
	for (const projected of [authoredValue, defaultValue, effectiveValue]) {
		if (projected !== null) {
			validateInspectorValueShape(projected, valueKind, constraints);
		}
	}
	return {
		authoredValue,
		defaultValue,
		effectiveValue,
		origin,
		validity: requiredPropertyValidity(object.validity),
		editable: requiredBoolean(object.editable, 'Inspector property editable'),
		modified: requiredBoolean(object.modified, 'Inspector property modified')
	};
}

/** Rejects projected values that contradict their descriptor-owned structural shape. */
function validateInspectorValueShape(
	value: InspectorValueDto,
	valueKind: ProjectValueKindDto,
	constraints: InspectorConstraintsDto
): void {
	if (value.kind !== valueKind) {
		throw new Error('Inspector property value does not match its structural kind');
	}
	if (value.kind !== 'array') {
		return;
	}
	if (constraints.exactElementCount !== null && value.values.length !== constraints.exactElementCount) {
		throw new Error('Inspector array value does not match its exact element count');
	}
	if (constraints.elementKind !== null && value.values.some(element => element.kind !== constraints.elementKind)) {
		throw new Error('Inspector array value does not match its element kind');
	}
}

/** Recursively validates every tagged Inspector value variant. */
function validateInspectorValue(value: JsonValue | undefined): InspectorValueDto {
	const object = requiredObject(value, 'Inspector value');
	const kind = requiredString(object.kind, 'Inspector value kind');
	switch (kind) {
		case 'null': return { kind };
		case 'boolean': return { kind, value: requiredBoolean(object.value, 'Inspector boolean value') };
		case 'number': return { kind, decimal: requiredDecimal(object.decimal, 'Inspector number decimal') };
		case 'text': return { kind, value: requiredString(object.value, 'Inspector text value') };
		case 'array': return {
			kind,
			values: requiredArray(object.values, 'Inspector array values').map(validateInspectorValue)
		};
		case 'object': {
			const values = requiredObject(object.values, 'Inspector object values');
			const validated: Record<string, InspectorValueDto> = {};
			for (const [key, entry] of Object.entries(values)) {
				validated[key] = validateInspectorValue(entry);
			}
			return { kind, values: validated };
		}
		case 'reference': return {
			kind,
			referenceKind: requiredReferenceKind(object.referenceKind),
			locator: requiredNonEmptyString(object.locator, 'Inspector reference locator'),
			label: requiredString(object.label, 'Inspector reference label'),
			resolution: requiredResolution(object.resolution),
			revealUri: nullableString(object.revealUri, 'Inspector reference revealUri')
		};
		case 'entity-target': return {
			kind,
			entityId: requiredNonEmptyString(object.entityId, 'Inspector entity target id'),
			label: requiredString(object.label, 'Inspector entity target label'),
			resolution: requiredResolution(object.resolution),
			occurrence: object.occurrence === null ? null : validateOccurrence(object.occurrence)
		};
		case 'component-target': return {
			kind,
			entityId: requiredNonEmptyString(object.entityId, 'Inspector component target entity id'),
			componentId: requiredNonEmptyString(object.componentId, 'Inspector component target component id'),
			entityLabel: requiredString(object.entityLabel, 'Inspector component target entity label'),
			componentLabel: requiredString(object.componentLabel, 'Inspector component target component label'),
			componentType: object.componentType === null ? null : validateInspectorComponentType(object.componentType),
			resolution: requiredResolution(object.resolution),
			occurrence: object.occurrence === null ? null : validateOccurrence(object.occurrence)
		};
		default: throw new Error('Inspector value kind is invalid');
	}
}

/** Validates the closed future mutation identity union. */
function validateInspectorMutationTarget(value: JsonValue | undefined): InspectorMutationTargetDto {
	const object = requiredObject(value, 'Inspector mutation target');
	const kind = requiredString(object.kind, 'Inspector mutation target kind');
	if (kind === 'entity-enabled') {
		return {
			kind,
			occurrence: validateOccurrence(object.occurrence),
			entityId: requiredNonEmptyString(object.entityId, 'Inspector mutation entityId')
		};
	}
	if (kind === 'component-property') {
		return {
			kind,
			occurrence: validateOccurrence(object.occurrence),
			entityId: requiredNonEmptyString(object.entityId, 'Inspector mutation entityId'),
			componentId: requiredNonEmptyString(object.componentId, 'Inspector mutation componentId'),
			propertyId: requiredNonEmptyString(object.propertyId, 'Inspector mutation propertyId')
		};
	}
	throw new Error('Inspector mutation target kind is invalid');
}

/** Serializes one already-validated semantic target as JSON request data. */
function semanticTargetJson(target: HierarchySemanticTargetDto): JsonObject {
	return {
		kind: target.kind,
		source: target.source,
		identity: target.identity,
		occurrence: target.occurrence === null ? null : {
			definitionAssetId: target.occurrence.definitionAssetId,
			entityPath: [...target.occurrence.entityPath]
		}
	};
}

/** Serializes one Java-issued mutation target without using labels or JSON pointers. */
function mutationTargetJson(target: InspectorMutationTargetDto): JsonObject {
	return target.kind === 'entity-enabled'
		? {
			kind: target.kind,
			occurrence: occurrenceJson(target.occurrence),
			entityId: target.entityId,
			componentId: null,
			propertyId: null
		}
		: {
			kind: target.kind,
			occurrence: occurrenceJson(target.occurrence),
			entityId: target.entityId,
			componentId: target.componentId,
			propertyId: target.propertyId
		};
}

function occurrenceJson(occurrence: HierarchyOccurrenceDto): JsonObject {
	return { definitionAssetId: occurrence.definitionAssetId, entityPath: [...occurrence.entityPath] };
}

/** Serializes one exact first-slice scalar candidate. */
function mutationValueJson(value: DefinitionMutationValueDto): JsonObject {
	return value.kind === 'boolean'
		? { kind: value.kind, value: value.value, literal: null }
		: { kind: value.kind, value: null, literal: value.literal };
}

function definitionOperationParams(projectGeneration: number, assetId: string, revision: number): JsonObject {
	return {
		expectedProjectGeneration: requiredPositiveInteger(projectGeneration, 'expectedProjectGeneration'),
		assetId: requiredNonEmptyString(assetId, 'assetId'),
		expectedDefinitionRevision: requiredInteger(revision, 'expectedDefinitionRevision')
	};
}

/** Validates authoritative working-copy lifecycle state. */
function validateDefinitionOperationResult(value: JsonValue): DefinitionOperationResultDto {
	const object = requiredObject(value, 'definition operation result');
	return {
		definition: requiredNonEmptyString(object.definition, 'definition'),
		outcome: requiredNonEmptyString(object.outcome, 'outcome'),
		revision: requiredInteger(object.revision, 'revision'),
		dirty: requiredBoolean(object.dirty, 'dirty'),
		canUndo: requiredBoolean(object.canUndo, 'canUndo'),
		canRedo: requiredBoolean(object.canRedo, 'canRedo'),
		diagnostics: requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic)
	};
}

/** Validates one opaque Java recovery capture. */
function validateDefinitionBackupResult(value: JsonValue): DefinitionBackupResultDto {
	const object = requiredObject(value, 'definition backup result');
	const result = {
		definition: requiredNonEmptyString(object.definition, 'definition'),
		outcome: requiredNonEmptyString(object.outcome, 'outcome'),
		revision: requiredInteger(object.revision, 'revision'),
		dirty: requiredBoolean(object.dirty, 'dirty'),
		canUndo: requiredBoolean(object.canUndo, 'canUndo'),
		canRedo: requiredBoolean(object.canRedo, 'canRedo'),
		backup: nullableString(object.backup, 'backup')
	};
	if ((result.backup !== null) !== (result.outcome === 'backed-up')) {
		throw new Error('definition backup result has an inconsistent shape');
	}
	return result;
}

/** Validates one complete structural-definition snapshot. */
function validateDefinitionSnapshot(value: JsonValue | undefined): DefinitionSnapshotDto {
	const object = requiredObject(value, 'definition');
	const context = requiredObject(object.context, 'definition.context');
	const origin = requiredDefinitionOrigin(context.origin);
	const editable = requiredBoolean(context.editable, 'definition.context.editable');
	if (editable && origin !== 'authored') {
		throw new Error('a generated definition cannot be editable');
	}
	return {
		revision: requiredInteger(object.revision, 'definition.revision'),
		context: {
			assetId: requiredNonEmptyString(context.assetId, 'definition.context.assetId'),
			kind: requiredDefinitionKind(context.kind),
			origin,
			editable,
			source: requiredNonEmptyString(context.source, 'definition.context.source'),
			label: validateAuthoringText(context.label)
		},
		roots: requiredArray(object.roots, 'definition.roots').map(validateHierarchyNode)
	};
}

/** Recursively validates one hierarchy occurrence. */
function validateHierarchyNode(value: JsonValue): HierarchyNodeDto {
	const object = requiredObject(value, 'hierarchy node');
	return {
		occurrence: validateOccurrence(object.occurrence),
		kind: requiredHierarchyKind(object.kind),
		entityId: nullableString(object.entityId, 'hierarchy node.entityId'),
		definitionId: nullableString(object.definitionId, 'hierarchy node.definitionId'),
		label: validateAuthoringText(object.label),
		enabled: requiredBoolean(object.enabled, 'hierarchy node.enabled'),
		modified: requiredBoolean(object.modified, 'hierarchy node.modified'),
		editable: requiredBoolean(object.editable, 'hierarchy node.editable'),
		target: validateSemanticTarget(object.target),
		children: requiredArray(object.children, 'hierarchy node.children').map(validateHierarchyNode)
	};
}

/** Validates semantic occurrence identity independently of tree presentation. */
function validateOccurrence(value: JsonValue | undefined): HierarchyOccurrenceDto {
	const object = requiredObject(value, 'occurrence');
	return {
		definitionAssetId: requiredNonEmptyString(object.definitionAssetId, 'occurrence.definitionAssetId'),
		entityPath: requiredStringArray(object.entityPath, 'occurrence.entityPath')
	};
}

/** Validates one future-Inspector semantic target. */
function validateSemanticTarget(value: JsonValue | undefined): HierarchySemanticTargetDto {
	const object = requiredObject(value, 'semantic target');
	return {
		kind: requiredTargetKind(object.kind),
		source: requiredNonEmptyString(object.source, 'semantic target.source'),
		identity: requiredNonEmptyString(object.identity, 'semantic target.identity'),
		occurrence: object.occurrence === null ? null : validateOccurrence(object.occurrence)
	};
}

/** Validates authored or Java-owned structured presentation text. */
function validateAuthoringText(value: JsonValue | undefined): AuthoringTextDto {
	const object = requiredObject(value, 'authoring text');
	const kind = requiredTextKind(object.kind);
	const messageCode = nullableString(object.messageCode, 'authoring text.messageCode');
	if ((kind === 'message') !== (messageCode !== null)) {
		throw new Error('authoring text messageCode does not match kind');
	}
	return {
		kind,
		text: requiredString(object.text, 'authoring text.text'),
		messageCode,
		arguments: requiredStringArray(object.arguments, 'authoring text.arguments')
	};
}

/** Validates a service-shutdown acknowledgement received from Java. */
function validateShutdownResult(value: JsonValue): ShutdownResultDto {
	const object = requiredObject(value, 'service/shutdown result');
	return { shutdown: requiredBoolean(object.shutdown, 'shutdown') };
}

/** Validates a protocol-version object. */
function validateProtocolVersion(value: JsonValue | undefined): ProtocolVersionDto {
	const object = requiredObject(value, 'protocolVersion');
	return {
		major: requiredInteger(object.major, 'protocolVersion.major'),
		minor: requiredInteger(object.minor, 'protocolVersion.minor')
	};
}

/** Validates the project summary and its Java-owned semantic catalog. */
function validateProjectSummary(value: JsonValue | undefined): ProjectSummaryDto {
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
function validateProjectCatalogEntry(value: JsonValue): ProjectCatalogEntryDto {
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
function validateProjectDiagnostic(value: JsonValue): ProjectDiagnosticDto {
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
function requiredDiagnosticSeverity(value: JsonValue | undefined): ProjectDiagnosticDto['severity'] {
	if (value !== 'error' && value !== 'warning') {
		throw new Error('diagnostic.severity must be error or warning');
	}
	return value;
}

/** Requires one of the outcomes defined by the Java replacement contract. */
function requiredReplaceOutcome(value: JsonValue | undefined): ProjectReplaceResultDto['outcome'] {
	if (value !== 'replaced' && value !== 'candidateRejected' && value !== 'conflict') {
		throw new Error('project/replace outcome is invalid');
	}
	return value;
}

/** Requires one supported structural-definition kind. */
function requiredDefinitionKind(value: JsonValue | undefined): DefinitionContextDto['kind'] {
	if (value !== 'scene-definition' && value !== 'entity-definition') {
		throw new Error('definition.context.kind is invalid');
	}
	return value;
}

/** Requires one definition-level origin. */
function requiredDefinitionOrigin(
	value: JsonValue | undefined,
	name = 'definition.context.origin'
): DefinitionContextDto['origin'] {
	if (value !== 'authored' && value !== 'generated') {
		throw new Error(`${name} is invalid`);
	}
	return value;
}

/** Requires one semantic hierarchy kind. */
function requiredHierarchyKind(value: JsonValue | undefined): HierarchyNodeDto['kind'] {
	if (value !== 'local-entity' && value !== 'placement' && value !== 'generated-entity') {
		throw new Error('hierarchy node.kind is invalid');
	}
	return value;
}

/** Requires one semantic target kind. */
function requiredTargetKind(value: JsonValue | undefined): HierarchySemanticTargetDto['kind'] {
	if (value !== 'scene' && value !== 'local-entity' && value !== 'generated-entity' && value !== 'placement' && value !== 'asset') {
		throw new Error('semantic target.kind is invalid');
	}
	return value;
}

function requiredInspectorProvenance(value: JsonValue | undefined): InspectorSnapshotDto['provenance'] {
	if (value !== 'local' && value !== 'generated') {
		throw new Error('Inspector provenance is invalid');
	}
	return value;
}

function requiredInspectorGroupKind(value: JsonValue | undefined): InspectorTargetGroupDto['kind'] {
	if (value !== 'entity' && value !== 'component' && value !== 'placement') {
		throw new Error('Inspector group kind is invalid');
	}
	return value;
}

function requiredMetadataStatus(value: JsonValue | undefined): InspectorTargetGroupDto['metadataStatus'] {
	if (value !== 'available' && value !== 'unavailable') {
		throw new Error('Inspector metadata status is invalid');
	}
	return value;
}

function requiredProjectValueKind(value: JsonValue | undefined): ProjectValueKindDto {
	if (value !== 'null' && value !== 'boolean' && value !== 'number' && value !== 'text'
		&& value !== 'array' && value !== 'object' && value !== 'reference'
		&& value !== 'entity-target' && value !== 'component-target') {
		throw new Error('Inspector project value kind is invalid');
	}
	return value;
}

function requiredReferenceKind(value: JsonValue | undefined): 'project' | 'asset' | 'import' {
	if (value !== 'project' && value !== 'asset' && value !== 'import') {
		throw new Error('Inspector reference kind is invalid');
	}
	return value;
}

function requiredResolution(value: JsonValue | undefined): 'resolved' | 'broken' {
	if (value !== 'resolved' && value !== 'broken') {
		throw new Error('Inspector resolution is invalid');
	}
	return value;
}

function requiredEditorSemantic(value: JsonValue | undefined): InspectorEditorSemanticsDto['semantic'] {
	if (value !== 'default' && value !== 'integer' && value !== 'vector2' && value !== 'vector3'
		&& value !== 'euler-rotation' && value !== 'quaternion' && value !== 'color-linear') {
		throw new Error('Inspector editor semantic is invalid');
	}
	return value;
}

function validateEditorShape(
	semantic: InspectorEditorSemanticsDto['semantic'],
	valueKind: ProjectValueKindDto,
	elementKind: ProjectValueKindDto | null,
	exactElementCount: number | null
): void {
	if (semantic === 'integer' && valueKind !== 'number') {
		throw new Error('Integer semantics require a number property');
	}
	const counts: Partial<Record<InspectorEditorSemanticsDto['semantic'], number>> = {
		vector2: 2,
		vector3: 3,
		'euler-rotation': 3,
		quaternion: 4,
		'color-linear': 3
	};
	const count = counts[semantic];
	if (count !== undefined && (valueKind !== 'array' || elementKind !== 'number' || exactElementCount !== count)) {
		throw new Error(`${semantic} semantics require a fixed numeric array`);
	}
}

function requiredPropertyOrigin(value: JsonValue | undefined): InspectorPropertyStateDto['origin'] {
	if (value !== 'authored' && value !== 'default' && value !== 'unset') {
		throw new Error('Inspector property origin is invalid');
	}
	return value;
}

function requiredPropertyValidity(value: JsonValue | undefined): InspectorPropertyStateDto['validity'] {
	if (value !== 'valid' && value !== 'required-unset' && value !== 'broken-reference'
		&& value !== 'metadata-unavailable') {
		throw new Error('Inspector property validity is invalid');
	}
	return value;
}

/** Requires one structured presentation-text kind. */
function requiredTextKind(value: JsonValue | undefined): AuthoringTextDto['kind'] {
	if (value !== 'literal' && value !== 'message') {
		throw new Error('authoring text.kind is invalid');
	}
	return value;
}

/** Requires a JSON object at the named wire-contract location. */
function requiredObject(value: JsonValue | undefined, name: string): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${name} must be an object`);
	}
	return value as JsonObject;
}

/** Requires a JSON array at the named wire-contract location. */
function requiredArray(value: JsonValue | undefined, name: string): readonly JsonValue[] {
	if (!Array.isArray(value)) {
		throw new Error(`${name} must be an array`);
	}
	return value;
}

/** Requires a string at the named wire-contract location. */
function requiredString(value: JsonValue | undefined, name: string): string {
	if (typeof value !== 'string') {
		throw new Error(`${name} must be a string`);
	}
	return value;
}

/** Requires a non-empty string without canonicalizing authored identity text. */
function requiredNonEmptyString(value: JsonValue | undefined, name: string): string {
	const result = requiredString(value, name);
	if (result.length === 0) {
		throw new Error(`${name} must not be empty`);
	}
	return result;
}

/** Requires canonical non-exponent decimal text so Java precision is retained exactly. */
function requiredDecimal(value: JsonValue | undefined, name: string): string {
	const result = requiredString(value, name);
	if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result)) {
		throw new Error(`${name} must be canonical decimal text`);
	}
	return result;
}

/** Requires one exact non-blank development identity. */
function requiredNonBlankIdentity(value: string, name: string): string {
	if (value.length === 0 || value.trim() !== value) {
		throw new Error(`${name} must be non-blank without surrounding whitespace`);
	}
	return value;
}

/** Requires and canonicalizes a non-empty BCP 47 language tag. */
function requiredLanguageTag(value: string): string {
	if (value.length === 0 || value.trim() !== value) {
		throw new Error('clientLanguage must be a non-empty BCP 47 language tag');
	}
	try {
		const locale = new Intl.Locale(value);
		if (locale.language === 'und') {
			throw new Error('clientLanguage must identify a language');
		}
		return locale.toString();
	} catch (error) {
		throw new Error('clientLanguage must be a valid BCP 47 language tag', { cause: error });
	}
}

/** Requires either a string or explicit null at the named wire-contract location. */
function nullableString(value: JsonValue | undefined, name: string): string | null {
	return value === null ? null : requiredString(value, name);
}

/** Requires a boolean at the named wire-contract location. */
function requiredBoolean(value: JsonValue | undefined, name: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`${name} must be a boolean`);
	}
	return value;
}

/** Requires a non-negative safe integer at the named wire-contract location. */
function requiredInteger(value: JsonValue | undefined, name: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative integer`);
	}
	return value;
}

/** Requires a positive safe integer at the named wire-contract location. */
function requiredPositiveInteger(value: JsonValue | undefined, name: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

/** Requires either a non-negative safe integer or explicit null. */
function nullableInteger(value: JsonValue | undefined, name: string): number | null {
	return value === null ? null : requiredInteger(value, name);
}

/** Requires an array containing only strings. */
function requiredStringArray(value: JsonValue | undefined, name: string): readonly string[] {
	return requiredArray(value, name).map((entry, index) => requiredString(entry, `${name}[${index}]`));
}

/** Requires an object whose values are all strings. */
function requiredStringMap(value: JsonValue | undefined, name: string): Readonly<Record<string, string>> {
	const object = requiredObject(value, name);
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(object)) {
		result[key] = requiredString(entry, `${name}.${key}`);
	}
	return result;
}
