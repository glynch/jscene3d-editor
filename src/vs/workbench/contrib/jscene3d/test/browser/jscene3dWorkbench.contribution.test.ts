/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities, IEditorIdentifier } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IViewsRegistry, ViewContainerLocation } from '../../../../common/views.js';
import { breadcrumbsEnabledForEditor } from '../../../../browser/parts/editor/breadcrumbsControl.js';
import { Parts } from '../../../../services/layout/browser/layoutService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { emptyViewName } from '../../../files/browser/views/emptyView.js';
import { registerEmptyExplorerWelcomeContent } from '../../../files/browser/explorerViewlet.js';
import { GettingStartedInput } from '../../../welcomeGettingStarted/browser/gettingStartedInput.js';
import {
	closeJScene3DWelcomeEditors,
	JScene3DLayoutService,
	JScene3DLayoutStorage,
	JScene3DProjectTransitionLayout,
	JScene3DSidebarService,
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

	test('restores a visible Explorer sidebar after a project workspace transition', async () => {
		const fixture = new LayoutFixture(true, 'workbench.view.explorer');

		await fixture.transitionAndRestore();

		assert.deepStrictEqual(fixture.result(), {
			openedContainers: ['workbench.view.explorer'],
			partVisibilityChanges: [{ hidden: false, part: Parts.SIDEBAR_PART }]
		});
	});

	test('restores a hidden sidebar and its last active container', async () => {
		const fixture = new LayoutFixture(false, undefined, 'workbench.view.explorer');

		await fixture.transitionAndRestore();

		assert.deepStrictEqual(fixture.result(), {
			openedContainers: ['workbench.view.explorer'],
			partVisibilityChanges: [{ hidden: true, part: Parts.SIDEBAR_PART }]
		});
	});

	test('restores another active sidebar container', async () => {
		const fixture = new LayoutFixture(true, 'workbench.view.scm');

		await fixture.transitionAndRestore();

		assert.deepStrictEqual(fixture.result(), {
			openedContainers: ['workbench.view.scm'],
			partVisibilityChanges: [{ hidden: false, part: Parts.SIDEBAR_PART }]
		});
	});

	test('discards an invalid one-shot snapshot without changing layout', async () => {
		const storage = new TestLayoutStorage();
		storage.store('jscene3d.workbench.projectTransitionLayout.7', '{"version":2}', StorageScope.APPLICATION, StorageTarget.MACHINE);
		const layout = new TestLayoutService(true);
		const sidebar = new TestSidebarService('workbench.view.explorer');

		await new JScene3DProjectTransitionLayout(storage, layout, sidebar, 7).restore();

		assert.deepStrictEqual({ stored: storage.values.size, opened: sidebar.openedContainers, changed: layout.changes }, {
			stored: 0,
			opened: [],
			changed: []
		});
	});

	test('removes the snapshot when the workspace transition fails', async () => {
		const storage = new TestLayoutStorage();
		const layout = new TestLayoutService(true);
		const sidebar = new TestSidebarService('workbench.view.explorer');
		const transition = new JScene3DProjectTransitionLayout(storage, layout, sidebar, 7);

		await assert.rejects(transition.transition(async () => { throw new Error('transition failed'); }), /transition failed/);

		assert.deepStrictEqual({ stored: storage.values.size, flushes: storage.flushes }, { stored: 0, flushes: 2 });
	});

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
});

function context(values: Record<string, ContextKeyValue>): IContext {
	return { getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined };
}

class LayoutFixture {
	private readonly storage = new TestLayoutStorage();
	private readonly layout: TestLayoutService;
	private readonly sidebar: TestSidebarService;

	constructor(visible: boolean, activeContainerId?: string, lastActiveContainerId = activeContainerId ?? '') {
		this.layout = new TestLayoutService(visible);
		this.sidebar = new TestSidebarService(activeContainerId, lastActiveContainerId);
	}

	async transitionAndRestore(): Promise<void> {
		const transition = new JScene3DProjectTransitionLayout(this.storage, this.layout, this.sidebar, 7);
		await transition.transition(async () => { });
		this.layout.visible = !this.layout.visible;
		this.sidebar.activeContainerId = 'workbench.view.extensions';
		await transition.restore();
	}

	result(): { openedContainers: string[]; partVisibilityChanges: Array<{ hidden: boolean; part: Parts }> } {
		return {
			openedContainers: this.sidebar.openedContainers,
			partVisibilityChanges: this.layout.changes
		};
	}
}

class TestLayoutStorage implements JScene3DLayoutStorage {
	readonly values = new Map<string, string>();
	flushes = 0;

	get(key: string, _scope: StorageScope): string | undefined {
		return this.values.get(key);
	}

	store(key: string, value: string, _scope: StorageScope, _target: StorageTarget): void {
		this.values.set(key, value);
	}

	remove(key: string, _scope: StorageScope): void {
		this.values.delete(key);
	}

	async flush(): Promise<void> {
		this.flushes++;
	}
}

class TestLayoutService implements JScene3DLayoutService {
	readonly changes: Array<{ hidden: boolean; part: Parts }> = [];

	constructor(public visible: boolean) { }

	isVisible(_part: Parts): boolean {
		return this.visible;
	}

	setPartHidden(hidden: boolean, part: Parts): void {
		this.visible = !hidden;
		this.changes.push({ hidden, part });
	}
}

class TestSidebarService implements JScene3DSidebarService {
	readonly openedContainers: string[] = [];

	constructor(public activeContainerId?: string, private readonly lastActiveContainerId = activeContainerId ?? '') { }

	getActivePaneComposite(_location: ViewContainerLocation): { getId(): string } | undefined {
		return this.activeContainerId === undefined ? undefined : { getId: () => this.activeContainerId! };
	}

	getLastActivePaneCompositeId(_location: ViewContainerLocation): string {
		return this.lastActiveContainerId;
	}

	async openPaneComposite(id: string | undefined, _location: ViewContainerLocation, _focus?: boolean): Promise<unknown> {
		if (id !== undefined) {
			this.openedContainers.push(id);
			this.activeContainerId = id;
		}
		return undefined;
	}
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
