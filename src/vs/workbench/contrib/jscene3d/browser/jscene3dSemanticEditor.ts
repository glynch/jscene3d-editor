/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';

export const JSCENE3D_SCENE_DEFINITION_VIEW_TYPE = 'jscene3d.sceneDefinition';
export const JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE = 'jscene3d.authoredDefinition';

/** Semantic presentation supplied by the JScene3D definition editor type. */
export interface JScene3DDefinitionEditorPresentation {
	readonly icon: ThemeIcon;
	readonly source: URI;
}

/** Returns semantic presentation only for the two JScene3D definition editor types. */
export function jscene3dDefinitionEditorPresentation(
	viewType: string,
	resource: URI
): JScene3DDefinitionEditorPresentation | undefined {
	let icon: ThemeIcon;
	switch (viewType) {
		case JSCENE3D_SCENE_DEFINITION_VIEW_TYPE:
			icon = Codicon.symbolNamespace;
			break;
		case JSCENE3D_AUTHORED_DEFINITION_VIEW_TYPE:
			icon = Codicon.symbolClass;
			break;
		default:
			return undefined;
	}
	return {
		icon,
		source: resource.with({ query: null, fragment: null })
	};
}
