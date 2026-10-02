/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJScene3DViewportLaunch, isViewportLaunch } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, EditorsOrder } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { JScene3DViewportEditorInput } from '../browser/jscene3dViewportEditorInput.js';
import { JScene3DViewportEditorPane } from './jscene3dViewportEditorPane.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		JScene3DViewportEditorPane,
		JScene3DViewportEditorPane.ID,
		localize('jscene3dNativeViewportPane', "JScene3D Renderer Preview")
	),
	[new SyncDescriptor(JScene3DViewportEditorInput)]
);

/** Internal bridge used by the built-in extension after Java prepares an authoritative launch. */
export const JSCENE3D_OPEN_PROJECT_VIEWPORT_COMMAND_ID = 'jscene3d.workbench.openProjectViewport';
export const JSCENE3D_CLOSE_PROJECT_VIEWPORTS_COMMAND_ID = 'jscene3d.workbench.closeProjectViewports';

CommandsRegistry.registerCommand(JSCENE3D_OPEN_PROJECT_VIEWPORT_COMMAND_ID, async (accessor, launch: unknown) => {
	if (!isViewportLaunch(launch)) {
		throw new Error('Invalid JScene3D project viewport launch');
	}
	await accessor.get(IEditorService).openEditor(
		new JScene3DViewportEditorInput(launch),
		{ pinned: true, revealIfOpened: true }
	);
});

CommandsRegistry.registerCommand(JSCENE3D_CLOSE_PROJECT_VIEWPORTS_COMMAND_ID, async (accessor, identity: unknown) => {
	const requested = viewportProjectIdentity(identity);
	const editorService = accessor.get(IEditorService);
	const editors = editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => {
		if (!(editor instanceof JScene3DViewportEditorInput)) {
			return false;
		}
		return requested === undefined || sameProjectGeneration(editor.launch, requested);
	});
	await editorService.closeEditors(editors);
});

interface ViewportProjectIdentity {
	readonly connectionGeneration: string;
	readonly projectGeneration: number;
}

function viewportProjectIdentity(value: unknown): ViewportProjectIdentity | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as Partial<ViewportProjectIdentity>;
	const projectGeneration = candidate.projectGeneration;
	return typeof candidate.connectionGeneration === 'string' && candidate.connectionGeneration.length > 0
		&& Number.isInteger(projectGeneration) && projectGeneration !== undefined && projectGeneration > 0
		? { connectionGeneration: candidate.connectionGeneration, projectGeneration }
		: undefined;
}

function sameProjectGeneration(launch: IJScene3DViewportLaunch, identity: ViewportProjectIdentity): boolean {
	return launch.connectionGeneration === identity.connectionGeneration
		&& launch.projectGeneration === identity.projectGeneration;
}
