/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionContextDto, DefinitionSnapshotDto } from '../protocol/authoringProtocol';

/** Minimal Code OSS URI surface used to derive a stable extension-owned resource key. */
export interface DefinitionResourceUri {
	toString(skipEncoding?: boolean): string;
}

/** Uses the unencoded URI form shared with the resource string registered before {@code vscode.openWith}. */
export function definitionResourceKey(resource: DefinitionResourceUri): string {
	return resource.toString(true);
}

/** Creates a connection- and generation-unique editor resource while retaining authored source identity. */
export function definitionResourceUri(
	connectionGeneration: string,
	projectGeneration: number,
	definition: DefinitionSnapshotDto
): string {
	if (connectionGeneration.length === 0) {
		throw new Error('Definition resource connection generation must not be empty');
	}
	const context = definition.context;
	const source = context.origin === 'authored'
		? new URL(context.source)
		: new URL(`jscene3d-definition://generated/${context.assetId}.${definitionKindFileExtension(context.kind)}`);
	source.searchParams.set('jscene3dConnectionGeneration', connectionGeneration);
	source.searchParams.set('jscene3dGeneration', String(projectGeneration));
	source.searchParams.set('jscene3dAssetId', context.assetId);
	return source.toString();
}

/** Maps every supported definition kind to its authored filename suffix. */
export function definitionKindFileExtension(kind: DefinitionContextDto['kind']): string {
	switch (kind) {
		case 'world-definition':
			return 'world.json';
		case 'entity-definition':
			return 'entity.json';
	}
}
