/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import * as perf from '../../../../base/common/performance.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import product from '../../../../platform/product/common/product.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { GettingStartedInput } from '../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { removePartsSplash } from '../../splash/browser/partsSplash.js';
import {
	JScene3DProjectLoadingSplashData,
	hideJScene3DProjectLoadingSplash,
	showJScene3DProjectLoadingSplash
} from './jscene3dProjectLoadingSplash.js';
import { JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE, JSCENE3D_SCENE_DEFINITION_VIEW_TYPE } from './jscene3dSemanticEditor.js';

export const JSCENE3D_OPEN_DEFINITION_EDITOR_COMMAND_ID = 'jscene3d.workbench.openDefinitionEditor';
export const JSCENE3D_CLOSE_WELCOME_COMMAND_ID = 'jscene3d.workbench.closeWelcome';
export const JSCENE3D_COMPLETE_STARTUP_PRESENTATION_COMMAND_ID = 'jscene3d.workbench.completeStartupPresentation';
export const JSCENE3D_SHOW_PROJECT_LOADING_SPLASH_COMMAND_ID = 'jscene3d.workbench.showProjectLoadingSplash';
export const JSCENE3D_HIDE_PROJECT_LOADING_SPLASH_COMMAND_ID = 'jscene3d.workbench.hideProjectLoadingSplash';

const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';
const projectContextKeys = new Set([projectOpenContext]);

interface WelcomeSidebarLayout {
	isVisible(part: Parts.SIDEBAR_PART): boolean;
	setPartHidden(hidden: boolean, part: Parts.SIDEBAR_PART): void;
}

/** Temporarily gives top-level Welcome the editor width without changing the user's sidebar preference. */
export class JScene3DWelcomeSidebarController implements IDisposable {
	private controllingSidebar = false;
	private restoreVisibleSidebar = false;

	constructor(private readonly layoutService: WelcomeSidebarLayout) { }

	update(welcomeActiveWithoutProject: boolean): void {
		if (welcomeActiveWithoutProject === this.controllingSidebar) {
			return;
		}

		this.controllingSidebar = welcomeActiveWithoutProject;
		if (welcomeActiveWithoutProject) {
			this.restoreVisibleSidebar = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			if (this.restoreVisibleSidebar) {
				this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			}
			return;
		}

		this.restoreSidebar();
	}

	dispose(): void {
		this.controllingSidebar = false;
		this.restoreSidebar();
	}

	private restoreSidebar(): void {
		if (this.restoreVisibleSidebar && !this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		}
		this.restoreVisibleSidebar = false;
	}
}

/** Owns the Welcome-only sidebar presentation at the workbench layout boundary. */
export class JScene3DWelcomeLayoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.jscene3dWelcomeLayout';

	private readonly sidebarController: JScene3DWelcomeSidebarController;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super();
		this.sidebarController = this._register(new JScene3DWelcomeSidebarController(layoutService));
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateSidebar()));
		this._register(this.contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(projectContextKeys)) {
				this.updateSidebar();
			}
		}));
		this._register(lifecycleService.onWillShutdown(() => this.sidebarController.dispose()));
		this.updateSidebar();
	}

	private updateSidebar(): void {
		const editor = this.editorService.activeEditor;
		const welcomeActive = editor instanceof GettingStartedInput
			&& editor.showWelcome
			&& editor.selectedCategory === undefined
			&& editor.walkthroughPageTitle === undefined;
		const projectOpen = this.contextKeyService.getContextKeyValue<boolean>(projectOpenContext) === true;
		this.sidebarController.update(welcomeActive && !projectOpen);
	}
}

/** Registers the JScene3D semantic project commands directly in the first-level File menu. */
export function registerJScene3DFileMenu(): IDisposable {
	return MenuRegistry.appendMenuItems([
		{
			id: MenuId.MenubarFileMenu,
			item: {
				group: '2_open',
				command: {
					id: 'jscene3d.openProject',
					title: localize({ key: 'jscene3d.fileMenu.openProject', comment: ['&& denotes a mnemonic'] }, "Open &&Project..."),
					precondition: ContextKeyExpr.not(projectBusyContext)
				},
				order: 0
			}
		},
		{
			id: MenuId.MenubarFileMenu,
			item: {
				group: '6_close',
				command: {
					id: 'jscene3d.closeProject',
					title: localize({ key: 'jscene3d.fileMenu.closeProject', comment: ['&& denotes a mnemonic'] }, "Close Pro&&ject"),
					precondition: ContextKeyExpr.and(ContextKeyExpr.has(projectOpenContext), ContextKeyExpr.not(projectBusyContext))
				},
				when: ContextKeyExpr.has(projectOpenContext),
				order: 2
			}
		}
	]);
}

/** Opens a definition with its Java-owned semantic label while preserving its source resource identity. */
export async function openJScene3DDefinitionEditor(
	editorService: IEditorService,
	resource: string,
	viewType: string,
	label: string
): Promise<void> {
	if (typeof resource !== 'string' || resource.length === 0
		|| typeof label !== 'string' || label.length === 0
		|| typeof viewType !== 'string'
		|| viewType !== JSCENE3D_SCENE_DEFINITION_VIEW_TYPE
		&& viewType !== JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE) {
		throw new Error('Invalid JScene3D definition editor presentation');
	}
	await editorService.openEditor({
		resource: URI.parse(resource),
		label,
		options: { pinned: true, override: viewType }
	});
}

/** Closes only the top-level JScene3D Welcome input, leaving walkthroughs and other editors untouched. */
export async function closeJScene3DWelcomeEditors(editorService: IEditorService): Promise<void> {
	const welcomeEditors = editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(identifier => {
		const editor = identifier.editor;
		return editor instanceof GettingStartedInput
			&& editor.showWelcome
			&& editor.selectedCategory === undefined
			&& editor.walkthroughPageTitle === undefined;
	});
	if (welcomeEditors.length > 0) {
		await editorService.closeEditors(welcomeEditors);
	}
}

/** Removes transient restored groups once application-startup coverage can yield to a coherent presentation. */
export function completeJScene3DStartupPresentation(
	editorGroupsService: IEditorGroupsService,
	targetWindow: Window,
	revealApplicationSplash: boolean
): boolean {
	// eslint-disable-next-line no-restricted-syntax
	const startupSplash = targetWindow.document.getElementById('monaco-parts-splash')?.classList.contains('jscene3d-startup-splash') === true;
	if (startupSplash && !revealApplicationSplash) {
		return false;
	}
	for (const group of [...editorGroupsService.groups]) {
		if (group !== editorGroupsService.activeGroup && group.isEmpty) {
			editorGroupsService.removeGroup(group);
		}
	}
	if (startupSplash) {
		removePartsSplash(targetWindow);
		perf.mark('code/didRemovePartsSplash');
	}
	return true;
}

if (product.applicationName === 'jscene3d-editor') {
	CommandsRegistry.registerCommand<[string, string, string]>(
		JSCENE3D_OPEN_DEFINITION_EDITOR_COMMAND_ID,
		(accessor, resource, viewType, label) => openJScene3DDefinitionEditor(
			accessor.get(IEditorService), resource, viewType, label)
	);

	CommandsRegistry.registerCommand(
		JSCENE3D_CLOSE_WELCOME_COMMAND_ID,
		accessor => closeJScene3DWelcomeEditors(accessor.get(IEditorService))
	);

	CommandsRegistry.registerCommand<[boolean]>(
		JSCENE3D_COMPLETE_STARTUP_PRESENTATION_COMMAND_ID,
		(accessor, revealApplicationSplash) => completeJScene3DStartupPresentation(
			accessor.get(IEditorGroupsService), mainWindow, revealApplicationSplash)
	);

	CommandsRegistry.registerCommand<[number, JScene3DProjectLoadingSplashData]>(
		JSCENE3D_SHOW_PROJECT_LOADING_SPLASH_COMMAND_ID,
		(_accessor, operationId, data) => showJScene3DProjectLoadingSplash(mainWindow, operationId, data)
	);

	CommandsRegistry.registerCommand<[number, number]>(
		JSCENE3D_HIDE_PROJECT_LOADING_SPLASH_COMMAND_ID,
		(_accessor, operationId, fadeDurationMs) => hideJScene3DProjectLoadingSplash(
			mainWindow,
			operationId,
			fadeDurationMs
		)
	);

	registerJScene3DFileMenu();
	registerWorkbenchContribution2(
		JScene3DWelcomeLayoutContribution.ID,
		JScene3DWelcomeLayoutContribution,
		WorkbenchPhase.AfterRestored
	);
}
