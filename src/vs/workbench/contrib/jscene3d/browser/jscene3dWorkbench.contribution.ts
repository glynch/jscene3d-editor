/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import product from '../../../../platform/product/common/product.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorsOrder } from '../../../common/editor.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { GettingStartedInput } from '../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE, JSCENE3D_SCENE_DEFINITION_VIEW_TYPE } from './jscene3dSemanticEditor.js';

export const JSCENE3D_OPEN_PROJECT_WORKSPACE_COMMAND_ID = 'jscene3d.workbench.openProjectWorkspace';
export const JSCENE3D_CLOSE_PROJECT_WORKSPACE_COMMAND_ID = 'jscene3d.workbench.closeProjectWorkspace';
export const JSCENE3D_OPEN_DEFINITION_EDITOR_COMMAND_ID = 'jscene3d.workbench.openDefinitionEditor';
export const JSCENE3D_CLOSE_WELCOME_COMMAND_ID = 'jscene3d.workbench.closeWelcome';

const projectOpenContext = 'jscene3d.projectOpen';
const projectBusyContext = 'jscene3d.projectBusy';
const layoutSnapshotKeyPrefix = 'jscene3d.workbench.projectTransitionLayout';

/** Versioned, narrow workbench state carried across one project workspace transition. */
interface LayoutSnapshot {
	readonly version: 1;
	readonly sidebarVisible: boolean;
	readonly sidebarContainerId?: string;
}

/** The storage operations required by the one-shot project-transition snapshot. */
export interface JScene3DLayoutStorage {
	get(key: string, scope: StorageScope): string | undefined;
	store(key: string, value: string, scope: StorageScope, target: StorageTarget): void;
	remove(key: string, scope: StorageScope): void;
	flush(): Promise<void>;
}

/** The primary-sidebar operations required by project-transition restoration. */
export interface JScene3DLayoutService {
	isVisible(part: Parts): boolean;
	setPartHidden(hidden: boolean, part: Parts): void;
}

/** The sidebar-container operations required by project-transition restoration. */
export interface JScene3DSidebarService {
	getActivePaneComposite(location: ViewContainerLocation): { getId(): string } | undefined;
	getLastActivePaneCompositeId(location: ViewContainerLocation): string;
	openPaneComposite(id: string | undefined, location: ViewContainerLocation, focus?: boolean): Promise<unknown>;
}

/** Preserves only sidebar visibility and container identity across a reused-window workspace transition. */
export class JScene3DProjectTransitionLayout {
	private readonly storageKey: string;

	constructor(
		private readonly storageService: JScene3DLayoutStorage,
		private readonly layoutService: JScene3DLayoutService,
		private readonly sidebarService: JScene3DSidebarService,
		windowId: number
	) {
		this.storageKey = `${layoutSnapshotKeyPrefix}.${windowId}`;
	}

	/** Captures the current sidebar state, persists it, and then performs the workspace transition. */
	async transition(transition: () => Promise<void>): Promise<void> {
		const activeContainerId = this.sidebarService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.getId();
		const snapshot: LayoutSnapshot = {
			version: 1,
			sidebarVisible: this.layoutService.isVisible(Parts.SIDEBAR_PART),
			sidebarContainerId: (activeContainerId ?? this.sidebarService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar)) || undefined
		};
		this.storageService.store(this.storageKey, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
		await this.storageService.flush();

		try {
			await transition();
		} catch (error) {
			this.storageService.remove(this.storageKey, StorageScope.APPLICATION);
			await this.storageService.flush();
			throw error;
		}
	}

	/** Consumes and applies the one-shot snapshot after the destination workspace has restored. */
	async restore(): Promise<void> {
		const storedSnapshot = this.storageService.get(this.storageKey, StorageScope.APPLICATION);
		if (storedSnapshot === undefined) {
			return;
		}

		this.storageService.remove(this.storageKey, StorageScope.APPLICATION);
		await this.storageService.flush();
		const snapshot = parseLayoutSnapshot(storedSnapshot);
		if (snapshot === undefined) {
			return;
		}

		if (snapshot.sidebarContainerId !== undefined) {
			await this.sidebarService.openPaneComposite(snapshot.sidebarContainerId, ViewContainerLocation.Sidebar, false);
		}
		this.layoutService.setPartHidden(!snapshot.sidebarVisible, Parts.SIDEBAR_PART);
	}
}

/** Restores a pending JScene3D project-transition layout after workbench restoration. */
class JScene3DProjectTransitionLayoutContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.jscene3dProjectTransitionLayout';

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IPaneCompositePartService sidebarService: IPaneCompositePartService,
		@IStorageService storageService: IStorageService
	) {
		new JScene3DProjectTransitionLayout(storageService, layoutService, sidebarService, mainWindow.vscodeWindowId)
			.restore()
			.catch(onUnexpectedError);
	}
}

/** Parses only the supported snapshot shape and rejects stale or malformed data. */
function parseLayoutSnapshot(value: string): LayoutSnapshot | undefined {
	try {
		const candidate: unknown = JSON.parse(value);
		if (typeof candidate !== 'object' || candidate === null) {
			return undefined;
		}
		const snapshot = candidate as Partial<LayoutSnapshot>;
		if (snapshot.version !== 1 || typeof snapshot.sidebarVisible !== 'boolean') {
			return undefined;
		}
		if (snapshot.sidebarContainerId !== undefined && typeof snapshot.sidebarContainerId !== 'string') {
			return undefined;
		}
		return {
			version: 1,
			sidebarVisible: snapshot.sidebarVisible,
			sidebarContainerId: snapshot.sidebarContainerId
		};
	} catch {
		return undefined;
	}
}

/** Creates the transition helper from the workbench's registered services. */
function projectTransitionLayout(accessor: ServicesAccessor): JScene3DProjectTransitionLayout {
	return new JScene3DProjectTransitionLayout(
		accessor.get(IStorageService),
		accessor.get(IWorkbenchLayoutService),
		accessor.get(IPaneCompositePartService),
		mainWindow.vscodeWindowId
	);
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

	CommandsRegistry.registerCommand<[string]>(JSCENE3D_OPEN_PROJECT_WORKSPACE_COMMAND_ID, async (accessor, rootUri) => {
		if (typeof rootUri !== 'string') {
			throw new TypeError('JScene3D project workspace URI must be a string.');
		}
		const hostService = accessor.get(IHostService);
		const folderUri = URI.parse(rootUri, true);
		await projectTransitionLayout(accessor).transition(() => hostService.openWindow([{ folderUri }], { forceReuseWindow: true }));
	});

	CommandsRegistry.registerCommand(JSCENE3D_CLOSE_PROJECT_WORKSPACE_COMMAND_ID, async accessor => {
		const hostService = accessor.get(IHostService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		await projectTransitionLayout(accessor).transition(() => hostService.openWindow({
			forceReuseWindow: true,
			remoteAuthority: environmentService.remoteAuthority
		}));
	});

	registerJScene3DFileMenu();

	registerWorkbenchContribution2(
		JScene3DProjectTransitionLayoutContribution.ID,
		JScene3DProjectTransitionLayoutContribution,
		WorkbenchPhase.AfterRestored
	);
}
