/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectionScopedResult, DefinitionOpenResultDto, ProjectDiagnosticDto } from '../protocol/authoringProtocol';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from './authoredDefinitionState';
import { definitionResourceUri } from './definitionResource';

export const authoredDefinitionViewType = 'jscene3d.authoredDefinition';
export const openDefinitionCommandId = 'jscene3d.openDefinition';

/** Expected outcome of requesting and opening one authored definition. */
export type AuthoredDefinitionOpenOutcome =
	| {
		readonly status: 'opened';
		readonly resource: AuthoredDefinitionResource;
		readonly diagnostics: readonly ProjectDiagnosticDto[];
	}
	| {
		readonly status: 'rejected';
		readonly diagnostics: readonly ProjectDiagnosticDto[];
		readonly failureCode: string | null;
	};

/** Protocol operation needed by the generic authored-definition opener. */
export interface DefinitionOpenClient {
	openDefinition(
		expectedProjectGeneration: number,
		assetId: string
	): Promise<ConnectionScopedResult<DefinitionOpenResultDto>>;
}

/** Opens a generation-scoped definition through the registered JScene3D custom-editor view type. */
export class AuthoredDefinitionOpener {
	constructor(
		private readonly client: DefinitionOpenClient,
		private readonly state: AuthoredDefinitionState,
		private readonly openWith: (resource: string, viewType: string) => Promise<unknown>
	) { }

	async open(projectGeneration: number, assetId: string): Promise<AuthoredDefinitionOpenOutcome> {
		const response = await this.client.openDefinition(projectGeneration, assetId);
		const result = response.result;
		if (!result.opened) {
			return {
				status: 'rejected',
				diagnostics: result.diagnostics,
				failureCode: result.failureCode
			};
		}
		if (result.projectGeneration !== projectGeneration || result.definition.context.assetId !== assetId) {
			throw new Error('Definition response identity does not match the requested project generation and AssetId');
		}
		const resource = definitionResourceUri(response.connectionGeneration, result.projectGeneration, result.definition);
		const mapping = this.state.register(resource, result.projectGeneration, result.definition);
		await this.openWith(resource, authoredDefinitionViewType);
		return { status: 'opened', resource: mapping, diagnostics: result.diagnostics };
	}
}
