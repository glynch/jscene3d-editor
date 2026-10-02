/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
	closeProjectCommandId,
	createProjectCommandId,
	gettingStartedCommandId,
	openProjectCommandId
} from '../authoring/authoringWorkflow';
import { authoredDefinitionViewType, openDefinitionCommandId } from '../definition/authoredDefinitionOpener';
import { hierarchyViewId } from '../hierarchy/hierarchyViewModel';
import { inspectorViewId } from '../inspector/inspectorView';
import { projectViewId } from '../project/projectViewModel';
import { openStartupWorldViewportCommandId } from '../viewport/viewportWorkflow';

suite('JScene3D extension contributions', () => {
	test('contributes the JScene3D Java tooling defaults', () => {
		const defaults = extensionManifest().contributes.configurationDefaults;

		assert.strictEqual(defaults['java.compile.nullAnalysis.mode'], 'disabled');
		assert.strictEqual(defaults['java.import.gradle.enabled'], false);
	});

	test('does not misplace project commands under File New File', () => {
		const manifest = extensionManifest();
		assert.strictEqual(manifest.contributes.menus['file/newFile'], undefined);
	});

	test('keeps Open Project enabled with or without an active project', () => {
		const commands = extensionManifest().contributes.commands;
		const open = commands.find(command => command.command === openProjectCommandId);
		const close = commands.find(command => command.command === closeProjectCommandId);

		assert.strictEqual(open?.enablement, '!jscene3d.projectBusy');
		assert.strictEqual(close?.enablement, 'jscene3d.projectOpen && !jscene3d.projectBusy');
	});

	test('registers the read-only authored-definition editor and native Hierarchy view', () => {
		const contributions = extensionManifest().contributes;
		const editor = contributions.customEditors.find(candidate => candidate.viewType === authoredDefinitionViewType);
		const openDefinition = contributions.commands.find(command => command.command === openDefinitionCommandId);

		assert.strictEqual(editor?.priority, 'option');
		assert.deepStrictEqual(editor?.selector.map(entry => entry.filenamePattern), ['*.world.json', '*.entity.json']);
		assert.strictEqual(openDefinition?.enablement, 'jscene3d.projectOpen && !jscene3d.projectBusy');
	});

	test('keeps Project available and makes Hierarchy conditional on an open project', () => {
		const contributions = extensionManifest().contributes;
		const container = contributions.viewsContainers.activitybar.find(candidate => candidate.id === 'jscene3d');
		const hierarchy = contributions.views.jscene3d.find(view => view.id === hierarchyViewId);
		const project = contributions.views.jscene3d.find(view => view.id === projectViewId);
		const messages = extensionMessages();
		const icon = path.join(__dirname, '..', '..', container?.icon ?? '');

		assert.deepStrictEqual(container, {
			id: 'jscene3d',
			title: '%viewsContainer.jscene3d%',
			icon: 'resources/jscene3d-mark.svg'
		});
		assert.strictEqual(localizedMessage(messages['viewsContainer.jscene3d']), 'JScene3D');
		assert.deepStrictEqual(contributions.views.jscene3d.map(view => view.id), [
			hierarchyViewId,
			projectViewId
		]);
		assert.strictEqual(hierarchy?.when, 'jscene3d.projectOpen');
		assert.strictEqual(hierarchy?.visibility, 'visible');
		assert.strictEqual(project?.when, undefined);
		assert.strictEqual(project?.visibility, 'collapsed');
		assert.ok((contributions.views.explorer ?? []).every(view => !view.id.startsWith('jscene3d.')));
		assert.strictEqual(path.extname(icon), '.svg');
		assert.ok(fs.statSync(icon).isFile());
	});

	test('contributes the Inspector as a localized Secondary Side Bar webview', () => {
		const manifest = extensionManifest();
		const contributions = manifest.contributes;
		const container = contributions.viewsContainers.secondarySidebar.find(
			candidate => candidate.id === 'jscene3d-inspector'
		);
		const inspector = contributions.views['jscene3d-inspector']?.find(view => view.id === inspectorViewId);
		const messages = extensionMessages();

		assert.deepStrictEqual(container, {
			id: 'jscene3d-inspector',
			title: '%viewsContainer.inspector%',
			icon: 'resources/jscene3d-mark.svg'
		});
		assert.match(container.id, /^[a-z0-9_-]+$/i);
		assert.deepStrictEqual(inspector, {
			id: inspectorViewId,
			name: '%view.inspector%',
			type: 'webview',
			visibility: 'visible'
		});
		assert.strictEqual(localizedMessage(messages['viewsContainer.inspector']), 'JScene3D Inspector');
		assert.strictEqual(localizedMessage(messages['view.inspector']), 'Inspector');
		assert.strictEqual(manifest.contributes.configurationDefaults['workbench.secondarySideBar.defaultVisibility'], 'visibleInWorkspace');
	});

	test('keeps only the project-open Hierarchy welcome state', () => {
		const welcomes = extensionManifest().contributes.viewsWelcome.filter(entry => entry.view === hierarchyViewId);
		const messages = extensionMessages();

		assert.deepStrictEqual(
			welcomes.map(welcome => ({
				contents: welcome.contents,
				when: welcome.when,
				localized: localizedContribution(welcome.contents, messages)
			})),
			[
				{
					contents: '%view.hierarchy.noActiveDefinition%',
					when: 'jscene3d.projectOpen && !jscene3d.definitionActive',
					localized: `Open a JScene3D authored definition to show its hierarchy.\n[Open Startup World](command:${openDefinitionCommandId})`
				}
			]
		);
		assert.deepStrictEqual(
			{
				noActiveDefinition: messageComments(messages['view.hierarchy.noActiveDefinition']),
				hasNoProjectMessage: messages['view.hierarchy.noProject'] !== undefined,
				hasRawLocalization: welcomes.some(welcome => localizedContribution(welcome.contents, messages)?.includes('%'))
			},
			{
				noActiveDefinition: ['{Locked="](command:jscene3d.openDefinition)"}'],
				hasNoProjectMessage: false,
				hasRawLocalization: false
			}
		);
	});

	test('keeps runtime-owned command identifiers aligned with contributions', () => {
		const contributed = extensionManifest().contributes.commands.map(command => command.command);

		assert.deepStrictEqual(contributed, [
			createProjectCommandId,
			openProjectCommandId,
			closeProjectCommandId,
			openDefinitionCommandId,
			openStartupWorldViewportCommandId,
			gettingStartedCommandId
		]);
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
			readonly secondarySidebar: readonly { readonly id: string; readonly title: string; readonly icon: string }[];
		};
		readonly customEditors: readonly {
			readonly viewType: string;
			readonly priority: string;
			readonly selector: readonly { readonly filenamePattern: string }[];
		}[];
		readonly views: Readonly<Record<string, readonly {
			readonly id: string; readonly name?: string; readonly type?: string; readonly visibility?: string; readonly when?: string;
		}[] | undefined>> & {
			readonly jscene3d: readonly { readonly id: string; readonly visibility?: string; readonly when?: string }[];
		};
		readonly configurationDefaults: Readonly<Record<string, unknown>>;
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
