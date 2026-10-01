/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

/** Temporary Stage 3 identity for the renderer-owned validation scene. */
export class JScene3DViewportEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.jscene3dRendererPreview';
	static readonly RESOURCE = URI.from({ scheme: 'jscene3d-renderer-preview', path: '/native-viewport' });

	override get typeId(): string { return JScene3DViewportEditorInput.ID; }
	override get editorId(): string { return JScene3DViewportEditorInput.ID; }
	override get resource(): URI { return JScene3DViewportEditorInput.RESOURCE; }
	override getName(): string { return localize('jscene3dRendererPreviewName', "JScene3D Renderer Preview"); }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }
	override matches(other: EditorInput | unknown): boolean { return other instanceof JScene3DViewportEditorInput; }
}
