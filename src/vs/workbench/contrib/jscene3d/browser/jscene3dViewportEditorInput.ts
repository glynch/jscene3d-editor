/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IJScene3DViewportLaunch } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

/** One generation-scoped native viewport for a Java-prepared project world. */
export class JScene3DViewportEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.jscene3dRendererPreview';

	readonly resource: URI;

	constructor(readonly launch: IJScene3DViewportLaunch) {
		super();
		this.resource = URI.from({
			scheme: 'jscene3d-viewport',
			authority: encodeURIComponent(launch.connectionGeneration),
			path: `/${launch.projectGeneration}/${encodeURIComponent(launch.worldAssetId)}/${launch.viewportId}`
		});
	}

	override get typeId(): string { return JScene3DViewportEditorInput.ID; }
	override get editorId(): string { return JScene3DViewportEditorInput.ID; }
	override getName(): string {
		return localize('jscene3dProjectViewportName', "{0} — {1}", this.launch.projectName, this.launch.worldName);
	}
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }
	override matches(other: EditorInput | unknown): boolean {
		return other instanceof JScene3DViewportEditorInput && other.resource.toString() === this.resource.toString();
	}
}
