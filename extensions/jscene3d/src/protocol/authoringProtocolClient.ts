/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonRpcClient } from './jsonRpcClient';
import { JsonObject, JsonValue } from './messageTransport';
import { AuthoringOperationMethod, ConnectionScopedResult, InitializeResultDto, ShutdownResultDto, authoringProtocolMethods, authoringProtocolVersion, requiredAuthoringCapabilities, validateInitializeResult, validateShutdownResult } from './authoringProtocolCommon';
import { ProjectCloseResultDto, ProjectOpenResultDto, ProjectReplaceParamsDto, ProjectReplaceResultDto, ViewportLaunchResultDto, validateProjectCloseResult, validateProjectOpenResult, validateProjectReplaceResult, validateViewportLaunchResult } from './authoringProjectProtocol';
import { SceneViewReadResultDto, validateSceneViewReadResult } from './authoringSceneViewProtocol';
import { DefinitionOpenResultDto, HierarchySemanticTargetDto, InspectorMutationTargetDto, InspectorReadResultDto, semanticTargetJson, validateDefinitionOpenResult, validateInspectorReadResult } from './authoringDefinitionProtocol';
import { DefinitionBackupResultDto, DefinitionMutationDto, DefinitionMutationValueDto, DefinitionOperationResultDto, definitionOperationParams, mutationTargetJson, mutationValueJson, validateDefinitionBackupResult, validateDefinitionOperationResult } from './authoringInteractiveEditProtocol';
import { requiredInteger, requiredLanguageTag, requiredNonBlankIdentity, requiredNonEmptyString, requiredPositiveInteger } from './authoringProtocolValidation';

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

	async interactDefinition(
		expectedProjectGeneration: number,
		assetId: string,
		expectedDefinitionRevision: number,
		target: InspectorMutationTargetDto,
		phase: 'begin' | 'update' | 'commit' | 'cancel',
		editId: string,
		value?: DefinitionMutationValueDto
	): Promise<DefinitionOperationResultDto> {
		if ((phase === 'update') !== (value !== undefined)) {
			throw new Error('Interactive definition update requires exactly one value');
		}
		return (await this.request(authoringProtocolMethods.interactDefinition, {
			expectedProjectGeneration: requiredPositiveInteger(expectedProjectGeneration, 'expectedProjectGeneration'),
			assetId: requiredNonEmptyString(assetId, 'assetId'),
			expectedDefinitionRevision: requiredInteger(expectedDefinitionRevision, 'expectedDefinitionRevision'),
			target: mutationTargetJson(target),
			phase,
			editId: requiredNonEmptyString(editId, 'editId'),
			value: value === undefined ? null : mutationValueJson(value),
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

