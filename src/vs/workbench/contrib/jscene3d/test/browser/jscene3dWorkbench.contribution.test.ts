/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
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
	JScene3DWelcomeSidebarController,
	openJScene3DDefinitionEditor,
	registerJScene3DFileMenu
} from '../../browser/jscene3dWorkbench.contribution.js';
import {
	hideJScene3DProjectLoadingSplash,
	isJScene3DProjectLoadingSplashVisible,
	showJScene3DProjectLoadingSplash
} from '../../browser/jscene3dProjectLoadingSplash.js';
import {
	createJScene3DWelcome,
	formatJScene3DRecentProjectTime
} from '../../browser/jscene3dWelcome.js';
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

	test('renders the branded Welcome composition and wires existing action commands', async () => {
		const calls: Array<{ command: string; args: readonly unknown[] }> = [];
		const commandService = {
			executeCommand: <T>(command: string, ...args: unknown[]): Promise<T> => {
				calls.push({ command, args });
				return Promise.resolve((command === 'jscene3d.getRecentProjects' ? [] : undefined) as T);
			}
		} as ICommandService;
		const store = disposables.add(new DisposableStore());
		const welcome = createJScene3DWelcome(commandService, store);
		await Promise.resolve();

		assert.strictEqual(welcome.querySelector('h1')?.textContent, 'JScene3D');
		assert.strictEqual(welcome.querySelector('.jscene3d-welcome-hero h2')?.textContent, 'Create. Build. Play.');
		assert.strictEqual(
			welcome.querySelector('.jscene3d-welcome-description')?.textContent,
			'A modular 3D engine and authoring platform for Java developers.'
		);
		assert.match((welcome.querySelector('.jscene3d-welcome-mark') as HTMLImageElement).src, /jscene3d-mark\.svg/);
		assert.match((welcome.querySelector('.jscene3d-welcome-hero-artwork') as HTMLImageElement).src, /jscene3d-welcome-hero\.png/);
		assert.deepStrictEqual(
			[...welcome.querySelectorAll('.jscene3d-welcome-card h2')].map(element => element.textContent),
			['Create Project', 'Open Project', 'Clone Repository', 'Get Started']
		);
		const icons = [...welcome.querySelectorAll<HTMLElement>('.jscene3d-welcome-card-icon')];
		assert.match((icons[0] as HTMLImageElement).src, /jscene3d-welcome-project-new\.svg/);
		assert.ok(icons[1].classList.contains('codicon-folder'));
		assert.ok(icons[2].classList.contains('codicon-source-control'));
		assert.match((icons[3] as HTMLImageElement).src, /jscene3d-welcome-documentation\.svg/);
		assert.strictEqual(icons[1].tagName, 'SPAN');
		assert.strictEqual(icons[2].tagName, 'SPAN');
		assert.strictEqual(welcome.querySelectorAll('.jscene3d-welcome-card-icon-area').length, 4);
		assert.strictEqual(welcome.querySelectorAll('.jscene3d-welcome-card-spacer').length, 4);
		for (const card of welcome.querySelectorAll('.jscene3d-welcome-card')) {
			assert.deepStrictEqual([...card.children].map(element => element.tagName), ['DIV', 'H2', 'P', 'DIV', 'BUTTON']);
			assert.ok(card.children[4].classList.contains('jscene3d-welcome-card-button'));
		}
		assert.match(welcome.querySelector('.jscene3d-welcome-recent-empty')?.textContent ?? '', /will appear here/);

		for (const button of welcome.querySelectorAll<HTMLButtonElement>('.jscene3d-welcome-card-button')) {
			button.click();
		}
		assert.deepStrictEqual(calls.slice(1).map(call => call.command), [
			'jscene3d.createProject', 'jscene3d.openProject', 'git.cloneRecursive', 'jscene3d.gettingStarted'
		]);
	});

	test('temporarily hides the Welcome sidebar and restores the prior visible state', () => {
		let sidebarVisible = true;
		const visibilityChanges: boolean[] = [];
		const controller = disposables.add(new JScene3DWelcomeSidebarController({
			isVisible: () => sidebarVisible,
			setPartHidden: hidden => {
				sidebarVisible = !hidden;
				visibilityChanges.push(sidebarVisible);
			}
		}));

		controller.update(true);
		controller.update(true);
		assert.strictEqual(sidebarVisible, false);
		assert.deepStrictEqual(visibilityChanges, [false]);

		controller.update(false);
		assert.strictEqual(sidebarVisible, true);
		assert.deepStrictEqual(visibilityChanges, [false, true]);
	});

	test('preserves an already-hidden sidebar and a sidebar the user reveals on Welcome', () => {
		let sidebarVisible = false;
		const visibilityChanges: boolean[] = [];
		const controller = disposables.add(new JScene3DWelcomeSidebarController({
			isVisible: () => sidebarVisible,
			setPartHidden: hidden => {
				sidebarVisible = !hidden;
				visibilityChanges.push(sidebarVisible);
			}
		}));

		controller.update(true);
		controller.update(false);
		assert.deepStrictEqual(visibilityChanges, []);

		sidebarVisible = true;
		controller.update(true);
		assert.deepStrictEqual(visibilityChanges, [false]);
		sidebarVisible = true;
		controller.update(false);
		assert.deepStrictEqual(visibilityChanges, [false]);
	});

	test('renders and opens Java Project history through the recent-Project command', async () => {
		const now = 1_800_000;
		const calls: Array<{ command: string; args: readonly unknown[] }> = [];
		const commandService = {
			executeCommand: <T>(command: string, ...args: unknown[]): Promise<T> => {
				calls.push({ command, args });
				const result = command === 'jscene3d.getRecentProjects'
					? Array.from({ length: 5 }, (_, index) => ({
						projectId: index === 0 ? 'sandbox' : `project-${index}`,
						name: index === 0 ? 'JScene3D Editor Sandbox' : `Project ${index}`,
						descriptorUri: index === 0
							? 'file:///projects/sandbox/sandbox.j3d'
							: `file:///projects/${index}/project-${index}.j3d`,
						compactPath: index === 0 ? '~/projects/sandbox' : `~/projects/${index}`,
						lastOpenedAt: now - (index + 2) * 60_000
					}))
					: undefined;
				return Promise.resolve(result as T);
			}
		} as ICommandService;
		const store = disposables.add(new DisposableStore());
		const welcome = createJScene3DWelcome(commandService, store, () => now);
		await Promise.resolve();

		const recent = welcome.querySelector<HTMLButtonElement>('.jscene3d-welcome-recent-row');
		assert.strictEqual(recent?.querySelector('.jscene3d-welcome-recent-name')?.textContent, 'JScene3D Editor Sandbox');
		assert.strictEqual(recent?.querySelector('.jscene3d-welcome-recent-path')?.textContent, '~/projects/sandbox');
		assert.strictEqual(recent?.querySelector('.jscene3d-welcome-recent-time')?.textContent, '2 minutes ago');
		const rows = welcome.querySelectorAll<HTMLButtonElement>('.jscene3d-welcome-recent-row');
		assert.strictEqual(rows[4].hidden, true);
		welcome.querySelector<HTMLButtonElement>('.jscene3d-welcome-show-more')?.click();
		assert.strictEqual(rows[4].hidden, false);
		recent?.click();

		assert.deepStrictEqual(calls.at(-1), {
			command: 'jscene3d.openRecentProject',
			args: ['file:///projects/sandbox/sandbox.j3d']
		});
		assert.strictEqual(formatJScene3DRecentProjectTime(now - 3_600_000, now), '1 hour ago');
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

	test('shows one compact Project overlay with metadata and blocks the workbench', async () => {
		const workbench = mainWindow.document.querySelector<HTMLElement>('.monaco-workbench')
			?? mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		workbench.classList.add('monaco-workbench');
		const wasInert = workbench.inert;
		try {
			showJScene3DProjectLoadingSplash(mainWindow, 41, {
				name: 'Doomed Corridors',
				version: '0.1.0-SNAPSHOT',
				description: 'An unofficial Doom-compatible first-person game built with JScene3D.',
				authors: ['Graham Lynch', 'JScene3D Team']
			});

			const overlay = mainWindow.document.querySelector<HTMLElement>('.jscene3d-project-loading-overlay');
			assert.ok(overlay);
			assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), true);
			assert.strictEqual(workbench.inert, true);
			assert.strictEqual(mainWindow.document.querySelectorAll('.jscene3d-project-loading-overlay').length, 1);
			assert.strictEqual(overlay.querySelector('.jscene3d-project-loading-name')?.textContent, 'Doomed Corridors');
			assert.strictEqual(overlay.querySelector('.jscene3d-project-loading-version')?.textContent, '0.1.0-SNAPSHOT');
			assert.match(overlay.querySelector('.jscene3d-project-loading-description')?.textContent ?? '', /Doom-compatible/);
			assert.strictEqual(overlay.querySelector('.jscene3d-project-loading-authors'), null);
			assert.strictEqual(overlay.querySelector('.jscene3d-project-loading-label')?.textContent, 'Loading Project…');
			assert.match((overlay.querySelector('.jscene3d-project-loading-artwork') as HTMLImageElement).src, /jscene3d-welcome-hero\.png/);
			assert.match((overlay.querySelector('.jscene3d-project-loading-icon') as HTMLImageElement).src, /jscene3d-project-icon\.svg/);
		} finally {
			await hideJScene3DProjectLoadingSplash(mainWindow, 41, 0);
			workbench.inert = wasInert;
		}
		assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), false);
		assert.strictEqual(workbench.inert, wasInert);
	});

	test('collapses optional metadata and falls back when a Project icon fails', async () => {
		try {
			showJScene3DProjectLoadingSplash(mainWindow, 51, {
				name: 'Minimal Project',
				authors: [],
				iconUri: 'file:///projects/minimal/missing.png'
			});
			const overlay = mainWindow.document.querySelector<HTMLElement>('.jscene3d-project-loading-overlay');
			assert.ok(overlay);
			assert.strictEqual(overlay.querySelector('.jscene3d-project-loading-description'), null);
			assert.strictEqual(overlay.querySelector('.jscene3d-project-loading-authors'), null);
			const icon = overlay.querySelector('.jscene3d-project-loading-icon') as HTMLImageElement;
			assert.match(icon.src, /missing\.png/);
			icon.dispatchEvent(new mainWindow.Event('error'));
			assert.match(icon.src, /jscene3d-project-icon\.svg/);
		} finally {
			await hideJScene3DProjectLoadingSplash(mainWindow, 51, 0);
		}
	});

	test('replaces an existing overlay atomically and rejects stale completion', async () => {
		try {
			showJScene3DProjectLoadingSplash(mainWindow, 61, { name: 'Project A', authors: [] });
			showJScene3DProjectLoadingSplash(mainWindow, 62, { name: 'Project B', authors: [] });
			await hideJScene3DProjectLoadingSplash(mainWindow, 61, 0);

			assert.strictEqual(mainWindow.document.querySelectorAll('.jscene3d-project-loading-overlay').length, 1);
			assert.strictEqual(mainWindow.document.querySelector('.jscene3d-project-loading-name')?.textContent, 'Project B');
			assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), true);
		} finally {
			await hideJScene3DProjectLoadingSplash(mainWindow, 62, 0);
		}
	});

	test('keeps workbench dimming through the fade and removes it after opacity transition', async () => {
		const workbench = mainWindow.document.querySelector<HTMLElement>('.monaco-workbench')
			?? mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		workbench.classList.add('monaco-workbench');
		const wasInert = workbench.inert;
		showJScene3DProjectLoadingSplash(mainWindow, 71, { name: 'Project Fade', authors: [] });
		const overlay = mainWindow.document.querySelector<HTMLElement>('.jscene3d-project-loading-overlay');
		assert.ok(overlay);

		const hiding = hideJScene3DProjectLoadingSplash(mainWindow, 71, 200);
		assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), true);
		assert.strictEqual(workbench.inert, true);
		assert.strictEqual(overlay.classList.contains('jscene3d-project-loading-overlay-dismissing'), true);
		const transition = new mainWindow.Event('transitionend', { bubbles: true });
		Object.defineProperty(transition, 'propertyName', { value: 'opacity' });
		overlay.dispatchEvent(transition);
		await hiding;

		assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), false);
		assert.strictEqual(workbench.inert, wasInert);
	});

	test('reduced motion removes the overlay immediately after minimum-duration eligibility', async () => {
		const ownMatchMedia = Object.getOwnPropertyDescriptor(mainWindow, 'matchMedia');
		Object.defineProperty(mainWindow, 'matchMedia', {
			configurable: true,
			value: () => ({ matches: true }) as MediaQueryList
		});
		try {
			showJScene3DProjectLoadingSplash(mainWindow, 72, { name: 'Reduced Motion', authors: [] });

			await hideJScene3DProjectLoadingSplash(mainWindow, 72, 200);

			assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), false);
			assert.strictEqual(mainWindow.document.querySelector('.jscene3d-project-loading-overlay'), null);
		} finally {
			if (ownMatchMedia === undefined) {
				delete (mainWindow as Partial<Window>).matchMedia;
			} else {
				Object.defineProperty(mainWindow, 'matchMedia', ownMatchMedia);
			}
			await hideJScene3DProjectLoadingSplash(mainWindow, 72, 0);
		}
	});

	test('a stale fade completion cannot remove a replacement splash', async () => {
		try {
			showJScene3DProjectLoadingSplash(mainWindow, 81, { name: 'Fading Project', authors: [] });
			const oldOverlay = mainWindow.document.querySelector<HTMLElement>('.jscene3d-project-loading-overlay');
			assert.ok(oldOverlay);
			const fading = hideJScene3DProjectLoadingSplash(mainWindow, 81, 200);
			showJScene3DProjectLoadingSplash(mainWindow, 82, { name: 'Replacement Project', authors: [] });
			const transition = new mainWindow.Event('transitionend', { bubbles: true });
			Object.defineProperty(transition, 'propertyName', { value: 'opacity' });
			oldOverlay.dispatchEvent(transition);
			await fading;

			assert.strictEqual(isJScene3DProjectLoadingSplashVisible(mainWindow), true);
			assert.strictEqual(
				mainWindow.document.querySelector('.jscene3d-project-loading-name')?.textContent,
				'Replacement Project'
			);
		} finally {
			await hideJScene3DProjectLoadingSplash(mainWindow, 82, 0);
		}
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
