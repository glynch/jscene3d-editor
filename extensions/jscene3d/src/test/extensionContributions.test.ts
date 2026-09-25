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
		const openDefinition = contributions.commands.find(command => command.command === 'jscene3d.openDefinition');

		assert.strictEqual(editor?.priority, 'option');
		assert.deepStrictEqual(editor?.selector.map(entry => entry.filenamePattern), ['*.world.json', '*.entity.json']);
		assert.strictEqual(openDefinition?.enablement, 'jscene3d.projectOpen && !jscene3d.projectBusy');
	});

	test('places both JScene3D views in one localized Activity Bar container', () => {
		const contributions = extensionManifest().contributes;
		const container = contributions.viewsContainers.activitybar.find(candidate => candidate.id === 'jscene3d');
		const messages = extensionMessages();
		const icon = path.join(__dirname, '..', '..', container?.icon ?? '');

		assert.deepStrictEqual(container, {
			id: 'jscene3d',
			title: '%viewsContainer.jscene3d%',
			icon: 'resources/jscene3d-mark.svg'
		});
		assert.strictEqual(localizedMessage(messages['viewsContainer.jscene3d']), 'JScene3D');
		assert.deepStrictEqual(contributions.views.jscene3d.map(view => view.id), [
			'jscene3d.hierarchy',
			'jscene3d.project'
		]);
		assert.ok((contributions.views.explorer ?? []).every(view => !view.id.startsWith('jscene3d.')));
		assert.strictEqual(path.extname(icon), '.svg');
		assert.ok(fs.statSync(icon).isFile());
	});

	test('localizes the complete Hierarchy welcome content and preserves its action', () => {
		const welcome = extensionManifest().contributes.viewsWelcome.find(entry => entry.view === 'jscene3d.hierarchy');
		const messages = extensionMessages();

		assert.strictEqual(welcome?.contents, '%view.hierarchy.noActive%');
		assert.strictEqual(welcome?.when, '!jscene3d.definitionActive');
		assert.strictEqual(
			localizedContribution(welcome?.contents, messages),
			'Open a JScene3D authored definition to show its hierarchy.\n[Open Startup World](command:jscene3d.openDefinition)'
		);
		assert.deepStrictEqual(
			messageComments(messages['view.hierarchy.noActive']),
			['{Locked="](command:jscene3d.openDefinition)"}']
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
		assert.match(localizedMessage(messages['configuration.authoring.installedExtensionMetadata']), /separate from the Java module path/);
	});
});

interface ExtensionManifest {
	readonly contributes: {
		readonly commands: readonly { readonly command: string; readonly enablement?: string }[];
		readonly menus: Readonly<Record<string, readonly { readonly command: string; readonly when?: string }[]>>;
		readonly viewsContainers: {
			readonly activitybar: readonly { readonly id: string; readonly title: string; readonly icon: string }[];
		};
		readonly customEditors: readonly {
			readonly viewType: string;
			readonly priority: string;
			readonly selector: readonly { readonly filenamePattern: string }[];
		}[];
		readonly views: Readonly<Record<string, readonly { readonly id: string }[] | undefined>> & {
			readonly jscene3d: readonly { readonly id: string }[];
		};
		readonly viewsWelcome: readonly { readonly view: string; readonly contents: string; readonly when?: string }[];
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

type ExtensionMessage = string | { readonly message: string; readonly comment: readonly string[] };

function extensionMessages(): Readonly<Record<string, ExtensionMessage>> {
	const parsed: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.nls.json'), 'utf8'));
	if (!isRecord(parsed)) {
		throw new Error('Expected extension localization messages');
	}
	return parsed as Readonly<Record<string, ExtensionMessage>>;
}

function localizedMessage(message: ExtensionMessage): string {
	return typeof message === 'string' ? message : message.message;
}

function messageComments(message: ExtensionMessage): readonly string[] {
	return typeof message === 'string' ? [] : message.comment;
}

function localizedContribution(value: string | undefined, messages: Readonly<Record<string, ExtensionMessage>>): string | undefined {
	const match = value?.match(/^%(.+)%$/);
	return match === undefined || match === null ? value : localizedMessage(messages[match[1]]);
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
