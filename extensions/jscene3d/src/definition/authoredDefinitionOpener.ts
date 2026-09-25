/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionOpenResultDto } from '../protocol/authoringProtocol';
import { AuthoredDefinitionResource, AuthoredDefinitionState } from './authoredDefinitionState';
import { definitionResourceUri } from './definitionResource';

export const authoredDefinitionViewType = 'jscene3d.authoredDefinition';

/** Protocol operation needed by the generic authored-definition opener. */
export interface DefinitionOpenClient {
	openDefinition(expectedProjectGeneration: number, assetId: string): Promise<DefinitionOpenResultDto>;
}

/** Opens a generation-scoped definition through the registered JScene3D custom-editor view type. */
export class AuthoredDefinitionOpener {
	constructor(
		private readonly client: DefinitionOpenClient,
		private readonly state: AuthoredDefinitionState,
		private readonly openWith: (resource: string, viewType: string) => Promise<unknown>
	) { }

	async open(projectGeneration: number, assetId: string): Promise<AuthoredDefinitionResource> {
		const result = await this.client.openDefinition(projectGeneration, assetId);
		if (!result.opened || result.projectGeneration === null || result.definition === null) {
			throw new Error(result.failureCode ?? 'JScene3D could not open the definition');
		}
		if (result.projectGeneration !== projectGeneration || result.definition.context.assetId !== assetId) {
			throw new Error('Definition response identity does not match the requested project generation and AssetId');
		}
		const resource = definitionResourceUri(result.projectGeneration, result.definition);
		const mapping = this.state.register(resource, result.projectGeneration, result.definition);
		await this.openWith(resource, authoredDefinitionViewType);
		return mapping;
	}
}
