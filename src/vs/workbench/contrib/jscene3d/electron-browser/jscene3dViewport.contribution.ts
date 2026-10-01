/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
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

class OpenJScene3DNativeViewportAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openJScene3DNativeViewport',
			title: localize2('openJScene3DNativeViewport', "Open Native Viewport"),
			category: localize2('jscene3dCategory', "JScene3D"),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IEditorService).openEditor(new JScene3DViewportEditorInput(), { pinned: true, revealIfOpened: true });
	}
}

registerAction2(OpenJScene3DNativeViewportAction);
