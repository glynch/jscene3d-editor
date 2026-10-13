/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonValue } from './messageTransport';
import { requiredBoolean, requiredInteger, requiredObject, requiredString, requiredStringArray } from './authoringProtocolValidation';

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
	interactDefinition: 'definition/interact',
	undoDefinition: 'definition/undo',
	redoDefinition: 'definition/redo',
	saveDefinition: 'definition/save',
	revertDefinition: 'definition/revert',
	backupDefinition: 'definition/backup',
	restoreDefinitionBackup: 'definition/restoreBackup',
	readInspector: 'inspector/read',
	shutdown: 'service/shutdown'
} as const;

export type AuthoringProtocolMethod = typeof authoringProtocolMethods[keyof typeof authoringProtocolMethods];
export type AuthoringOperationMethod = Exclude<AuthoringProtocolMethod, typeof authoringProtocolMethods.initialize>;

export const requiredAuthoringCapabilities = Object.values(authoringProtocolMethods)
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
export interface ConnectionScopedResult<T> {
	readonly connectionGeneration: string;
	readonly result: T;
}

export interface ShutdownResultDto {
	readonly shutdown: boolean;
}

/** Typed Stage 1 protocol operations with initialization and generation checks. */
export function validateInitializeResult(value: JsonValue): InitializeResultDto {
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
export function validateShutdownResult(value: JsonValue): ShutdownResultDto {
	const object = requiredObject(value, 'service/shutdown result');
	return { shutdown: requiredBoolean(object.shutdown, 'shutdown') };
}

/** Validates a protocol-version object. */
export function validateProtocolVersion(value: JsonValue | undefined): ProtocolVersionDto {
	const object = requiredObject(value, 'protocolVersion');
	return {
		major: requiredInteger(object.major, 'protocolVersion.major'),
		minor: requiredInteger(object.minor, 'protocolVersion.minor')
	};
}

/** Validates the project summary and its Java-owned semantic catalog. */

