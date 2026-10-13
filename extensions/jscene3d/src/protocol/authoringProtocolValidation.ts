/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonObject, JsonValue } from './messageTransport';

export function requiredObject(value: JsonValue | undefined, name: string): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${name} must be an object`);
	}
	return value as JsonObject;
}

/** Requires a JSON array at the named wire-contract location. */
export function requiredArray(value: JsonValue | undefined, name: string): readonly JsonValue[] {
	if (!Array.isArray(value)) {
		throw new Error(`${name} must be an array`);
	}
	return value;
}

/** Requires a string at the named wire-contract location. */
export function requiredString(value: JsonValue | undefined, name: string): string {
	if (typeof value !== 'string') {
		throw new Error(`${name} must be a string`);
	}
	return value;
}

/** Requires a non-empty string without canonicalizing authored identity text. */
export function requiredNonEmptyString(value: JsonValue | undefined, name: string): string {
	const result = requiredString(value, name);
	if (result.length === 0) {
		throw new Error(`${name} must not be empty`);
	}
	return result;
}

/** Requires canonical non-exponent decimal text so Java precision is retained exactly. */
export function requiredDecimal(value: JsonValue | undefined, name: string): string {
	const result = requiredString(value, name);
	if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result)) {
		throw new Error(`${name} must be canonical decimal text`);
	}
	return result;
}

/** Requires one exact non-blank development identity. */
export function requiredNonBlankIdentity(value: string, name: string): string {
	if (value.length === 0 || value.trim() !== value) {
		throw new Error(`${name} must be non-blank without surrounding whitespace`);
	}
	return value;
}

/** Requires and canonicalizes a non-empty BCP 47 language tag. */
export function requiredLanguageTag(value: string): string {
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
export function nullableString(value: JsonValue | undefined, name: string): string | null {
	return value === null ? null : requiredString(value, name);
}

/** Requires a boolean at the named wire-contract location. */
export function requiredBoolean(value: JsonValue | undefined, name: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`${name} must be a boolean`);
	}
	return value;
}

/** Requires a non-negative safe integer at the named wire-contract location. */
export function requiredInteger(value: JsonValue | undefined, name: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative integer`);
	}
	return value;
}

/** Requires a positive safe integer at the named wire-contract location. */
export function requiredPositiveInteger(value: JsonValue | undefined, name: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

/** Requires either a non-negative safe integer or explicit null. */
export function nullableInteger(value: JsonValue | undefined, name: string): number | null {
	return value === null ? null : requiredInteger(value, name);
}

/** Requires an array containing only strings. */
export function requiredStringArray(value: JsonValue | undefined, name: string): readonly string[] {
	return requiredArray(value, name).map((entry, index) => requiredString(entry, `${name}[${index}]`));
}

/** Requires an object whose values are all strings. */
export function requiredStringMap(value: JsonValue | undefined, name: string): Readonly<Record<string, string>> {
	const object = requiredObject(value, name);
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(object)) {
		result[key] = requiredString(entry, `${name}.${key}`);
	}
	return result;
}

/** Validates a definition provenance token shared by catalog and authored-definition contracts. */
export function requiredDefinitionOrigin(value: JsonValue | undefined, name = 'definitionOrigin'): 'authored' | 'generated' {
	const origin = requiredString(value, name);
	if (origin !== 'authored' && origin !== 'generated') {
		throw new Error(`${name} is invalid`);
	}
	return origin;
}

/** Validates a resource-reference namespace shared by Inspector and Scene View contracts. */
export function requiredReferenceKind(value: JsonValue | undefined): 'project' | 'asset' | 'import' {
	const kind = requiredString(value, 'reference kind');
	if (kind !== 'project' && kind !== 'asset' && kind !== 'import') {
		throw new Error('reference kind must be project, asset, or import');
	}
	return kind;
}

