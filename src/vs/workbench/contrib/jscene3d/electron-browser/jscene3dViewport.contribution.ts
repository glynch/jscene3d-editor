/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJScene3DSceneViewSnapshot, IJScene3DViewportLaunch, isSceneViewSnapshot, isViewportLaunch } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry } from '../../../common/editor.js';
import { CustomEditorInput } from '../../customEditor/browser/customEditorInput.js';
import { IEditorReplacement } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { JScene3DSceneEditorInput, JScene3DSceneEditorInputSerializer } from '../browser/jscene3dSceneEditorInput.js';
import { JScene3DViewportEditorInput } from '../browser/jscene3dViewportEditorInput.js';
import { JScene3DViewportEditorPane } from './jscene3dViewportEditorPane.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		JScene3DViewportEditorPane,
		JScene3DViewportEditorPane.ID,
		localize('jscene3dNativeViewportPane', "JScene3D Renderer Preview")
	),
	[new SyncDescriptor(JScene3DViewportEditorInput), new SyncDescriptor(JScene3DSceneEditorInput)]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	JScene3DSceneEditorInput.ID,
	JScene3DSceneEditorInputSerializer
);

/** Internal bridge used by the built-in extension after Java prepares an authoritative launch. */
export const JSCENE3D_OPEN_PROJECT_VIEWPORT_COMMAND_ID = 'jscene3d.workbench.openProjectViewport';
export const JSCENE3D_OPEN_SCENE_EDITOR_COMMAND_ID = 'jscene3d.workbench.openSceneEditor';
export const JSCENE3D_CLOSE_PROJECT_VIEWPORTS_COMMAND_ID = 'jscene3d.workbench.closeProjectViewports';
export const JSCENE3D_UPDATE_SCENE_VIEW_COMMAND_ID = 'jscene3d.workbench.updateSceneView';
export const JSCENE3D_CLOSE_VIEWPORT_COMMAND_ID = 'jscene3d.workbench.closeViewport';

CommandsRegistry.registerCommand(JSCENE3D_OPEN_PROJECT_VIEWPORT_COMMAND_ID, async (accessor, launch: unknown) => {
	if (!isViewportLaunch(launch)) {
		throw new Error('Invalid JScene3D project viewport launch');
	}
	await accessor.get(IEditorService).openEditor(
		new JScene3DViewportEditorInput(launch),
		{ pinned: true, revealIfOpened: true, preserveFocus: launch.kind === 'scene' }
	);
});

CommandsRegistry.registerCommand(JSCENE3D_OPEN_SCENE_EDITOR_COMMAND_ID, async (accessor, ownerResource: unknown, launch: unknown) => {
	if (typeof ownerResource !== 'string' || ownerResource.length === 0 || !isViewportLaunch(launch) || launch.kind !== 'scene') {
		throw new Error('Invalid JScene3D Scene editor launch');
	}
	const resource = URI.parse(ownerResource);
	const editorService = accessor.get(IEditorService);
	const entries = editorService.getEditors(EditorsOrder.SEQUENTIAL);
	const existing = entries.find(entry => entry.editor instanceof JScene3DSceneEditorInput
		&& isEqual(entry.editor.resource, resource));
	if (existing?.editor instanceof JScene3DSceneEditorInput) {
		existing.editor.prepareLaunch(launch);
		await editorService.openEditor(existing.editor, { pinned: true, revealIfOpened: true });
		return;
	}
	const authored = entries.find(entry => entry.editor instanceof CustomEditorInput
		&& entry.editor.viewType === 'jscene3d.sceneDefinition'
		&& isEqual(entry.editor.resource, resource));
	if (!authored || !(authored.editor instanceof CustomEditorInput)) {
		throw new Error('The authored Scene editor is unavailable');
	}
	const sceneEditor = accessor.get(IInstantiationService).createInstance(
		JScene3DSceneEditorInput,
		authored.editor,
		new JScene3DViewportEditorInput(launch)
	);
	const replacement: IEditorReplacement = {
		editor: authored.editor,
		replacement: sceneEditor,
		options: { pinned: true, preserveFocus: false }
	};
	await editorService.replaceEditors([replacement], authored.groupId);
});

CommandsRegistry.registerCommand(JSCENE3D_UPDATE_SCENE_VIEW_COMMAND_ID, (accessor, viewportId: unknown, snapshot: unknown) => {
	if (typeof viewportId !== 'string' || !isSceneViewSnapshot(snapshot)) {
		return false;
	}
	const match = viewportEditors(accessor.get(IEditorService))
		.find(entry => entry.viewport.launch.viewportId === viewportId && entry.viewport.launch.kind === 'scene');
	return match?.viewport.updateSceneViewSnapshot(snapshot as IJScene3DSceneViewSnapshot);
});

CommandsRegistry.registerCommand(JSCENE3D_CLOSE_VIEWPORT_COMMAND_ID, async (accessor, viewportId: unknown) => {
	if (typeof viewportId !== 'string' || viewportId.length === 0) {
		return;
	}
	const editorService = accessor.get(IEditorService);
	await editorService.closeEditors(viewportEditors(editorService)
		.filter(entry => entry.viewport.launch.viewportId === viewportId)
		.map(entry => entry.identifier));
});

CommandsRegistry.registerCommand(JSCENE3D_CLOSE_PROJECT_VIEWPORTS_COMMAND_ID, async (accessor, identity: unknown) => {
	const requested = viewportProjectIdentity(identity);
	const editorService = accessor.get(IEditorService);
	const editors = viewportEditors(editorService).filter(entry => {
		return requested === undefined || sameProjectGeneration(entry.viewport.launch, requested);
	}).map(entry => entry.identifier);
	await editorService.closeEditors(editors);
});

function viewportEditors(editorService: IEditorService) {
	return editorService.getEditors(EditorsOrder.SEQUENTIAL).flatMap(identifier => {
		const editor = identifier.editor;
		const viewport = editor instanceof JScene3DSceneEditorInput
			? editor.viewport
			: editor instanceof JScene3DViewportEditorInput ? editor : undefined;
		return viewport === undefined ? [] : [{ identifier, viewport }];
	});
}

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
