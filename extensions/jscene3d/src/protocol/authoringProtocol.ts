/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonRpcClient } from './jsonRpcClient';
import { JsonObject, JsonValue } from './messageTransport';

export const authoringProtocolVersion = { major: 1, minor: 0 } as const;

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

/** Wire result for a project-open attempt, including validation diagnostics. */
export interface ProjectOpenResultDto {
	readonly opened: boolean;
	readonly projectGeneration: number | null;
	readonly project: ProjectSummaryDto | null;
	readonly diagnostics: readonly ProjectDiagnosticDto[];
	readonly failureCode: string | null;
}

/** Wire result for invalidating the active Java project session. */
export interface ProjectCloseResultDto {
	readonly closed: boolean;
	readonly invalidatedProjectGeneration: number | null;
}

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

	async initialize(): Promise<InitializeResultDto> {
		const response = await this.rpc.request('initialize', {
			protocolVersion: authoringProtocolVersion
		}, validateInitializeResult);
		const result = response.result;
		if (result.protocolVersion.major !== authoringProtocolVersion.major) {
			throw new Error(`Incompatible authoring protocol ${result.protocolVersion.major}.${result.protocolVersion.minor}`);
		}
		if (result.processKind !== 'authoring') {
			throw new Error(`Expected an authoring service but received process kind ${result.processKind}`);
		}
		for (const capability of ['project/open', 'project/close', 'service/shutdown']) {
			if (!result.capabilities.includes(capability)) {
				throw new Error(`Authoring service does not provide required capability ${capability}`);
			}
		}
		this.connectionGeneration = response.connectionGeneration;
		return result;
	}

	async openProject(path: string): Promise<ProjectOpenResultDto> {
		return (await this.request('project/open', { path }, validateProjectOpenResult)).result;
	}

	async closeProject(): Promise<ProjectCloseResultDto> {
		return (await this.request('project/close', {}, validateProjectCloseResult)).result;
	}

	async shutdown(): Promise<ShutdownResultDto> {
		return (await this.request('service/shutdown', {}, validateShutdownResult)).result;
	}

	dispose(): void {
		this.rpc.dispose();
	}

	private async request<T>(method: string, params: JsonObject, validate: (value: JsonValue) => T) {
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
	if (opened !== (generation !== null && project !== null)) {
		throw new Error('project/open result has an inconsistent success shape');
	}
	return {
		opened,
		projectGeneration: generation,
		project,
		diagnostics: requiredArray(object.diagnostics, 'diagnostics').map(validateProjectDiagnostic),
		failureCode: nullableString(object.failureCode, 'failureCode')
	};
}

/** Validates a project-close result received from Java. */
function validateProjectCloseResult(value: JsonValue): ProjectCloseResultDto {
	const object = requiredObject(value, 'project/close result');
	const closed = requiredBoolean(object.closed, 'closed');
	const invalidatedProjectGeneration = nullableInteger(object.invalidatedProjectGeneration, 'invalidatedProjectGeneration');
	if (closed !== (invalidatedProjectGeneration !== null)) {
		throw new Error('project/close result has an inconsistent success shape');
	}
	return {
		closed,
		invalidatedProjectGeneration
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
