/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('JScene3D extension contributions', () => {
	test('does not misplace project commands under File New File', () => {
		const manifest = extensionManifest();
		assert.strictEqual(manifest.contributes.menus['file/newFile'], undefined);
	});

	test('keeps Open Project enabled with or without an active project', () => {
		const commands = extensionManifest().contributes.commands;
		const open = commands.find(command => command.command === 'jscene3d.openProject');
		const close = commands.find(command => command.command === 'jscene3d.closeProject');

		assert.strictEqual(open?.enablement, '!jscene3d.projectBusy');
		assert.strictEqual(close?.enablement, 'jscene3d.projectOpen && !jscene3d.projectBusy');
	});

	test('registers the read-only authored-definition editor and native Hierarchy view', () => {
		const contributions = extensionManifest().contributes;
		const editor = contributions.customEditors.find(candidate => candidate.viewType === 'jscene3d.authoredDefinition');

		assert.strictEqual(editor?.priority, 'option');
		assert.deepStrictEqual(editor?.selector.map(entry => entry.filenamePattern), ['*.world.json', '*.entity.json']);
		assert.ok(contributions.views.explorer.some(view => view.id === 'jscene3d.hierarchy'));
		assert.ok(contributions.commands.some(command => command.command === 'jscene3d.openDefinition'));
	});

	test('externalizes the complete Hierarchy welcome content', () => {
		const welcome = extensionManifest().contributes.viewsWelcome.find(entry => entry.view === 'jscene3d.hierarchy');
		const messages = extensionMessages();

		assert.strictEqual(welcome?.contents, '%view.hierarchy.noActive%');
		assert.strictEqual(
			messages['view.hierarchy.noActive'],
			'Open a JScene3D authored definition to show its hierarchy.\n[Open Startup World](command:jscene3d.openDefinition)'
		);
	});

	test('contributes a separate installed extension metadata artifact path', () => {
		const manifest = extensionManifest();
		const metadata = manifest.contributes.configuration.properties['jscene3d.authoring.installedExtensionMetadata'];
		const messages = extensionMessages();

		assert.strictEqual(metadata.type, 'array');
		assert.strictEqual(metadata.items?.type, 'string');
		assert.deepStrictEqual(metadata.default, []);
		assert.strictEqual(metadata.scope, 'machine');
		assert.strictEqual(metadata.description, '%configuration.authoring.installedExtensionMetadata%');
		assert.match(messages['configuration.authoring.installedExtensionMetadata'], /separate from the Java module path/);
	});
});

interface ExtensionManifest {
	readonly contributes: {
		readonly commands: readonly { readonly command: string; readonly enablement?: string }[];
		readonly menus: Readonly<Record<string, readonly { readonly command: string; readonly when?: string }[]>>;
		readonly customEditors: readonly {
			readonly viewType: string;
			readonly priority: string;
			readonly selector: readonly { readonly filenamePattern: string }[];
		}[];
		readonly views: { readonly explorer: readonly { readonly id: string }[] };
		readonly viewsWelcome: readonly { readonly view: string; readonly contents: string }[];
		readonly configuration: {
			readonly properties: Readonly<Record<string, {
				readonly type: string;
				readonly items?: { readonly type: string };
				readonly default: unknown;
				readonly scope: string;
				readonly description: string;
			}>>;
		};
	};
}

function extensionMessages(): Readonly<Record<string, string>> {
	const parsed: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.nls.json'), 'utf8'));
	if (!isRecord(parsed)) {
		throw new Error('Expected extension localization messages');
	}
	return parsed as Readonly<Record<string, string>>;
}

function extensionManifest(): ExtensionManifest {
	const parsed: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
	if (!isRecord(parsed) || !isRecord(parsed.contributes)) {
		throw new Error('Expected extension manifest contributions');
	}
	const commands = parsed.contributes.commands;
	const menus = parsed.contributes.menus;
	if (!Array.isArray(commands) || !isRecord(menus)) {
		throw new Error('Expected extension command and menu contributions');
	}
	return parsed as unknown as ExtensionManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
