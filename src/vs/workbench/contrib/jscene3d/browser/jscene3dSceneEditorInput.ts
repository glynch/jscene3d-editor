/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IJScene3DViewportLaunch } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CustomEditorInput } from '../../customEditor/browser/customEditorInput.js';
import { JScene3DViewportEditorInput } from './jscene3dViewportEditorInput.js';

/** One semantic Scene editor that owns both authored-document and native-view lifecycles. */
export class JScene3DSceneEditorInput extends SideBySideEditorInput {
	static override readonly ID = 'workbench.input.jscene3dSceneEditor';

	constructor(
		readonly authored: CustomEditorInput,
		readonly viewport: JScene3DViewportEditorInput,
		@IEditorService editorService: IEditorService
	) {
		super(authored.getName(), undefined, viewport, authored, editorService);
	}

	override get typeId(): string { return JScene3DSceneEditorInput.ID; }
	override get editorId(): string { return this.authored.editorId; }
	override get resource(): URI { return this.authored.resource; }
	override get capabilities(): EditorInputCapabilities { return this.authored.capabilities; }
	override getName(): string { return this.authored.getName(); }
	override getDescription(verbosity?: Verbosity): string | undefined { return this.authored.getDescription(verbosity); }
	override getTitle(verbosity?: Verbosity): string { return this.authored.getTitle(verbosity); }
	override getIcon() { return this.authored.getIcon(); }

	prepareLaunch(launch: IJScene3DViewportLaunch): boolean {
		return this.viewport.prepareLaunch(launch);
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return this === other
			|| other instanceof JScene3DSceneEditorInput && this.authored.matches(other.authored)
			// During replacement, matching the exact primary input causes the workbench
			// to close this newly opened composite instead of the primary it replaced.
			|| other instanceof CustomEditorInput && other !== this.authored && this.authored.matches(other);
	}

	override dispose(): void {
		if (this.isDisposed()) {
			return;
		}
		super.dispose();
		this.viewport.dispose();
		this.authored.dispose();
	}
}

/** Persists the authored document while deliberately rebuilding the native Scene View after restore. */
export class JScene3DSceneEditorInputSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean {
		if (!(editor instanceof JScene3DSceneEditorInput)) {
			return false;
		}
		const serializer = this.authoredSerializer(editor.authored);
		return serializer?.canSerialize(editor.authored) === true;
	}

	serialize(editor: EditorInput): string | undefined {
		if (!(editor instanceof JScene3DSceneEditorInput)) {
			return undefined;
		}
		return this.authoredSerializer(editor.authored)?.serialize(editor.authored);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		const serializer = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
			.getEditorSerializer(CustomEditorInput.typeId);
		const restored = serializer?.deserialize(instantiationService, serializedEditor);
		return restored instanceof CustomEditorInput ? restored : undefined;
	}

	private authoredSerializer(authored: CustomEditorInput): IEditorSerializer | undefined {
		return Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).getEditorSerializer(authored);
	}
}
