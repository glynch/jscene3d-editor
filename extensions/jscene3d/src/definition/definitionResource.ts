/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionSnapshotDto } from '../protocol/authoringProtocol';

/** Minimal Code OSS URI surface used to derive a stable extension-owned resource key. */
export interface DefinitionResourceUri {
	toString(skipEncoding?: boolean): string;
}

/** Uses the unencoded URI form shared with the resource string registered before {@code vscode.openWith}. */
export function definitionResourceKey(resource: DefinitionResourceUri): string {
	return resource.toString(true);
}

/** Creates a generation-unique editor resource while retaining authored source identity where applicable. */
export function definitionResourceUri(projectGeneration: number, definition: DefinitionSnapshotDto): string {
	const context = definition.context;
	const source = context.origin === 'authored'
		? new URL(context.source)
		: new URL(`jscene3d-definition://generated/${context.assetId}.${context.kind === 'world-definition' ? 'world' : 'entity'}.json`);
	source.searchParams.set('jscene3dGeneration', String(projectGeneration));
	source.searchParams.set('jscene3dAssetId', context.assetId);
	return source.toString();
}
