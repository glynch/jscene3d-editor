/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities, IEditorIdentifier } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IViewsRegistry } from '../../../../common/views.js';
import { breadcrumbsEnabledForEditor } from '../../../../browser/parts/editor/breadcrumbsControl.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { emptyViewName } from '../../../files/browser/views/emptyView.js';
import { registerEmptyExplorerWelcomeContent } from '../../../files/browser/explorerViewlet.js';
import { GettingStartedInput } from '../../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { shouldRemovePartsSplashOnInitialLayout } from '../../../splash/browser/partsSplash.js';
import {
	closeJScene3DWelcomeEditors,
	completeJScene3DStartupPresentation,
	openJScene3DDefinitionEditor,
	registerJScene3DFileMenu
} from '../../browser/jscene3dWorkbench.contribution.js';
import {
	JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE,
	JSCENE3D_SCENE_DEFINITION_VIEW_TYPE,
	jscene3dDefinitionEditorPresentation
} from '../../browser/jscene3dSemanticEditor.js';

suite('JScene3D workbench integration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers first-level File menu project commands with established contexts', () => {
		let items = MenuRegistry.getMenuItems(MenuId.MenubarFileMenu)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'jscene3d.openProject' || item.command.id === 'jscene3d.closeProject');
		if (items.length === 0) {
			disposables.add(registerJScene3DFileMenu());
			items = MenuRegistry.getMenuItems(MenuId.MenubarFileMenu)
				.filter(isIMenuItem)
				.filter(item => item.command.id === 'jscene3d.openProject' || item.command.id === 'jscene3d.closeProject');
		}
		const menuState = items.map(item => ({
			id: item.command.id,
			group: item.group,
			order: item.order,
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			visibleWithoutProject: item.when?.evaluate(context({})) ?? true,
			enabledWithoutProject: item.command.precondition?.evaluate(context({})) ?? true,
			enabledWithProject: item.command.precondition?.evaluate(context({ 'jscene3d.projectOpen': true })) ?? true,
			enabledWhileBusy: item.command.precondition?.evaluate(context({ 'jscene3d.projectOpen': true, 'jscene3d.projectBusy': true })) ?? true
		}));

		assert.deepStrictEqual(menuState, [
			{
				id: 'jscene3d.openProject', group: '2_open', order: 0, title: 'Open &&Project...',
				visibleWithoutProject: true, enabledWithoutProject: true, enabledWithProject: true, enabledWhileBusy: false
			},
			{
				id: 'jscene3d.closeProject', group: '6_close', order: 2, title: 'Close Pro&&ject',
				visibleWithoutProject: false, enabledWithoutProject: false, enabledWithProject: true, enabledWhileBusy: false
			}
		]);
	});

	test('opens semantic definitions with Java labels and stable source resources', async () => {
		const opened: IResourceEditorInput[] = [];
		const editorService = {
			openEditor: async (input: IResourceEditorInput) => {
				opened.push(input);
				return undefined;
			}
		} as unknown as IEditorService;

		await openJScene3DDefinitionEditor(
			editorService,
			'file:///projects/sandbox/scenes/main.scene.json?jscene3dAssetId=scene-main',
			JSCENE3D_SCENE_DEFINITION_VIEW_TYPE,
			'Main'
		);
		await openJScene3DDefinitionEditor(
			editorService,
			'file:///projects/sandbox/entities/crate.entity.json?jscene3dAssetId=entity-crate',
			JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE,
			'Crate'
		);

		assert.deepStrictEqual(opened.map(input => ({
			resource: input.resource.toString(true),
			label: input.label,
			override: input.options?.override
		})), [
			{
				resource: 'file:///projects/sandbox/scenes/main.scene.json?jscene3dAssetId=scene-main',
				label: 'Main',
				override: JSCENE3D_SCENE_DEFINITION_VIEW_TYPE
			},
			{
				resource: 'file:///projects/sandbox/entities/crate.entity.json?jscene3dAssetId=entity-crate',
				label: 'Crate',
				override: JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE
			}
		]);
	});

	test('assigns distinct semantic icons and keeps the physical source for tooltips', () => {
		const resource = URI.parse('file:///projects/sandbox/scenes/main.scene.json?jscene3dAssetId=scene-main');
		const scene = jscene3dDefinitionEditorPresentation(JSCENE3D_SCENE_DEFINITION_VIEW_TYPE, resource);
		const entity = jscene3dDefinitionEditorPresentation(JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE, resource);

		assert.strictEqual(scene?.icon, Codicon.symbolNamespace);
		assert.strictEqual(entity?.icon, Codicon.symbolClass);
		assert.strictEqual(scene?.source.toString(true), 'file:///projects/sandbox/scenes/main.scene.json');
	});

	test('hides breadcrumbs only for semantic editor capabilities', () => {
		const semantic = disposables.add(new TestEditorInput('Main', EditorInputCapabilities.HideBreadcrumbs));
		const text = disposables.add(new TestEditorInput('main.scene.json', EditorInputCapabilities.None));

		assert.strictEqual(breadcrumbsEnabledForEditor(true, true, semantic), false);
		assert.strictEqual(breadcrumbsEnabledForEditor(true, true, text), true);
		assert.strictEqual(breadcrumbsEnabledForEditor(false, true, text), false);
	});

	test('closes only JScene3D Welcome and leaves walkthroughs and ordinary editors open', async () => {
		const welcome = disposables.add(new GettingStartedInput({ showWelcome: true }));
		const walkthrough = disposables.add(new GettingStartedInput({ showWelcome: true, selectedCategory: 'walkthrough' }));
		const ordinary = disposables.add(new TestEditorInput('notes.txt', EditorInputCapabilities.None));
		const editors: IEditorIdentifier[] = [
			{ groupId: 1, editor: welcome },
			{ groupId: 1, editor: walkthrough },
			{ groupId: 1, editor: ordinary }
		];
		let closed: readonly IEditorIdentifier[] = [];
		const editorService = {
			getEditors: () => editors,
			closeEditors: async (requested: readonly IEditorIdentifier[]) => { closed = requested; }
		} as unknown as IEditorService;

		await closeJScene3DWelcomeEditors(editorService);

		assert.deepStrictEqual(closed, [{ groupId: 1, editor: welcome }]);
	});

	test('registers the JScene3D no-project Explorer presentation', () => {
		const welcomeContent: string[] = [];
		const registry: Pick<IViewsRegistry, 'registerViewWelcomeContent'> = {
			registerViewWelcomeContent: (_id, content) => {
				welcomeContent.push(content.content);
				return { dispose: () => { } };
			}
		};
		registerEmptyExplorerWelcomeContent(registry, 'jscene3d-editor');

		assert.deepStrictEqual({ title: emptyViewName('jscene3d-editor').value, welcomeContent }, {
			title: 'No Project Opened',
			welcomeContent: ['Open a JScene3D project to get started.\n[Open Project...](command:jscene3d.openProject)']
		});
		assert.strictEqual(welcomeContent.some(content => content.includes('No Folder Opened')), false);
	});

	test('removes only empty inactive restored groups before revealing startup presentation', () => {
		const active = { isEmpty: false } as IEditorGroup;
		const empty = { isEmpty: true } as IEditorGroup;
		const occupied = { isEmpty: false } as IEditorGroup;
		const removed: IEditorGroup[] = [];
		const splash = mainWindow.document.createElement('div');
		splash.id = 'monaco-parts-splash';
		splash.className = 'jscene3d-startup-splash';
		mainWindow.document.body.appendChild(splash);
		const style = mainWindow.document.createElement('style');
		style.className = 'initialShellColors';
		mainWindow.document.head.appendChild(style);
		const groups = {
			activeGroup: active,
			groups: [active, empty, occupied],
			removeGroup: (group: IEditorGroup) => removed.push(group)
		} as unknown as IEditorGroupsService;

		const completed = completeJScene3DStartupPresentation(groups, mainWindow, true);

		assert.strictEqual(completed, true);
		assert.deepStrictEqual(removed, [empty]);
		assert.strictEqual(mainWindow.document.getElementById('monaco-parts-splash'), null);
		assert.strictEqual(mainWindow.document.head.querySelector('.initialShellColors'), null);
	});

	test('keeps automatic Project restoration covered by the application startup splash', () => {
		const active = { isEmpty: false } as IEditorGroup;
		const empty = { isEmpty: true } as IEditorGroup;
		const removed: IEditorGroup[] = [];
		const splash = mainWindow.document.createElement('div');
		splash.id = 'monaco-parts-splash';
		splash.className = 'jscene3d-startup-splash';
		mainWindow.document.body.appendChild(splash);
		const groups = {
			activeGroup: active,
			groups: [active, empty],
			removeGroup: (group: IEditorGroup) => removed.push(group)
		} as unknown as IEditorGroupsService;

		const completed = completeJScene3DStartupPresentation(groups, mainWindow, false);

		assert.strictEqual(completed, false);
		assert.deepStrictEqual(removed, []);
		assert.strictEqual(mainWindow.document.getElementById('monaco-parts-splash'), splash);
		splash.remove();
	});

	test('allows an ordinary Project transition to reveal its restored in-workbench presentation', () => {
		const active = { isEmpty: false } as IEditorGroup;
		const empty = { isEmpty: true } as IEditorGroup;
		const removed: IEditorGroup[] = [];
		const groups = {
			activeGroup: active,
			groups: [active, empty],
			removeGroup: (group: IEditorGroup) => removed.push(group)
		} as unknown as IEditorGroupsService;

		const completed = completeJScene3DStartupPresentation(groups, mainWindow, false);

		assert.strictEqual(completed, true);
		assert.deepStrictEqual(removed, [empty]);
	});

	test('retains the branded splash through initial workbench layout', () => {
		const splash = mainWindow.document.createElement('div');
		splash.id = 'monaco-parts-splash';
		splash.className = 'jscene3d-startup-splash';
		mainWindow.document.body.appendChild(splash);

		assert.strictEqual(shouldRemovePartsSplashOnInitialLayout(mainWindow), false);

		splash.remove();
	});
});

function context(values: Record<string, ContextKeyValue>): IContext {
	return { getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined };
}

class TestEditorInput extends EditorInput {
	override readonly resource = URI.from({ scheme: 'test', path: '/editor' });

	constructor(private readonly name: string, private readonly inputCapabilities: EditorInputCapabilities) {
		super();
	}

	override get typeId(): string { return 'test.editor'; }
	override getName(): string { return this.name; }
	override get capabilities(): EditorInputCapabilities { return this.inputCapabilities; }
}
