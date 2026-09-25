/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonRpcClient } from './jsonRpcClient';
import { JsonObject, JsonValue } from './messageTransport';

export const authoringProtocolVersion = { major: 1, minor: 1 } as const;

/** Single authority for method and capability names in the authoring protocol. */
export const authoringProtocolMethods = {
	initialize: 'initialize',
	openProject: 'project/open',
	replaceProject: 'project/replace',
	closeProject: 'project/close',
	openDefinition: 'definition/open',
	shutdown: 'service/shutdown'
} as const;

type AuthoringProtocolMethod = typeof authoringProtocolMethods[keyof typeof authoringProtocolMethods];
type AuthoringOperationMethod = Exclude<AuthoringProtocolMethod, typeof authoringProtocolMethods.initialize>;

const requiredAuthoringCapabilities = Object.values(authoringProtocolMethods)
	.filter((method): method is AuthoringOperationMethod => method !== authoringProtocolMethods.initialize);

/** Wire representation of the negotiated authoring protocol version. */
export interface ProtocolVersionDto {
	readonly major: number;
	readonly minor: number;
}

/** Wire result returned by the authoring service during initialization. */
export interface InitializeResultDto {
	readonly protocolVersion: ProtocolVersionDto;
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

/** Narrow wire summary of the configured startup world. */
export interface WorldSummaryDto {
	readonly id: string;
	readonly name: string;
}

/** Wire counts for authored and projected project assets. */
export interface AssetCountsDto {
	readonly authored: number;
	readonly projected: number;
}

/** Wire summary of the Java-retained authoring project. */
export interface ProjectSummaryDto {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly root: string;
	readonly descriptor: string;
	readonly startupWorld: WorldSummaryDto;
	readonly assetCounts: AssetCountsDto;
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
	readonly kind: 'world' | 'local-entity' | 'generated-entity' | 'placement' | 'asset';
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
	readonly kind: 'world-definition' | 'entity-definition';
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

	async initialize(clientLanguage: string): Promise<InitializeResultDto> {
		const response = await this.rpc.request(authoringProtocolMethods.initialize, {
			protocolVersion: authoringProtocolVersion,
			clientLanguage: requiredLanguageTag(clientLanguage)
		}, validateInitializeResult);
		const result = response.result;
		if (result.protocolVersion.major !== authoringProtocolVersion.major) {
			throw new Error(`Incompatible authoring protocol ${result.protocolVersion.major}.${result.protocolVersion.minor}`);
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

	async openDefinition(expectedProjectGeneration: number, assetId: string): Promise<DefinitionOpenResultDto> {
		return (await this.request(authoringProtocolMethods.openDefinition, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			assetId: requiredNonEmptyString(assetId, 'assetId')
		}, validateDefinitionOpenResult)).result;
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
}

/** Validates an initialize result received from Java. */
function validateInitializeResult(value: JsonValue): InitializeResultDto {
	const object = requiredObject(value, 'initialize result');
	return {
		protocolVersion: validateProtocolVersion(object.protocolVersion),
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

/** Validates one complete structural-definition snapshot. */
function validateDefinitionSnapshot(value: JsonValue | undefined): DefinitionSnapshotDto {
	const object = requiredObject(value, 'definition');
	const context = requiredObject(object.context, 'definition.context');
	const origin = requiredDefinitionOrigin(context.origin);
	const editable = requiredBoolean(context.editable, 'definition.context.editable');
	if (editable !== (origin === 'authored')) {
		throw new Error('definition.context editability must match origin');
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

/** Validates the narrow project summary used by the first editor slice. */
function validateProjectSummary(value: JsonValue | undefined): ProjectSummaryDto {
	const object = requiredObject(value, 'project');
	const startupWorld = requiredObject(object.startupWorld, 'startupWorld');
	const assetCounts = requiredObject(object.assetCounts, 'assetCounts');
	return {
		id: requiredString(object.id, 'project.id'),
		name: requiredString(object.name, 'project.name'),
		version: requiredString(object.version, 'project.version'),
		root: requiredString(object.root, 'project.root'),
		descriptor: requiredString(object.descriptor, 'project.descriptor'),
		startupWorld: {
			id: requiredString(startupWorld.id, 'startupWorld.id'),
			name: requiredString(startupWorld.name, 'startupWorld.name')
		},
		assetCounts: {
			authored: requiredInteger(assetCounts.authored, 'assetCounts.authored'),
			projected: requiredInteger(assetCounts.projected, 'assetCounts.projected')
		}
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
	if (value !== 'world-definition' && value !== 'entity-definition') {
		throw new Error('definition.context.kind is invalid');
	}
	return value;
}

/** Requires one definition-level origin. */
function requiredDefinitionOrigin(value: JsonValue | undefined): DefinitionContextDto['origin'] {
	if (value !== 'authored' && value !== 'generated') {
		throw new Error('definition.context.origin is invalid');
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
	if (value !== 'world' && value !== 'local-entity' && value !== 'generated-entity' && value !== 'placement' && value !== 'asset') {
		throw new Error('semantic target.kind is invalid');
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
