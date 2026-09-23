/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IExtensionManifestIdentifier {
	name?: unknown;
	publisher?: unknown;
}

interface IExtensionProductPolicy {
	excludedBuiltInExtensions?: unknown;
}

export function getExcludedBuiltinExtensionIds(product: IExtensionProductPolicy): ReadonlySet<string> {
	const excluded = product.excludedBuiltInExtensions;
	if (excluded === undefined) {
		return new Set();
	}
	if (!Array.isArray(excluded) || excluded.some(id => typeof id !== 'string' || id !== id.toLowerCase() || !id.includes('.'))) {
		throw new Error('product.json excludedBuiltInExtensions must be an array of canonical lower-case extension IDs.');
	}
	if (new Set(excluded).size !== excluded.length) {
		throw new Error('product.json excludedBuiltInExtensions contains duplicate extension IDs.');
	}
	return new Set(excluded);
}

export function isExcludedBuiltinExtension(manifest: IExtensionManifestIdentifier, excluded: ReadonlySet<string>): boolean {
	return typeof manifest.publisher === 'string'
		&& typeof manifest.name === 'string'
		&& excluded.has(`${manifest.publisher}.${manifest.name}`.toLowerCase());
}
