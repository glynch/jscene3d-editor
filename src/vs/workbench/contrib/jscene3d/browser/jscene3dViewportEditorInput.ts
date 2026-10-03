/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IJScene3DSceneViewSnapshot, IJScene3DViewportLaunch, isSceneViewSnapshot } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

/** One generation-scoped native viewport for a Java-prepared project Scene. */
export class JScene3DViewportEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.jscene3dRendererPreview';

	readonly resource: URI;
	private _launch: IJScene3DViewportLaunch;
	private readonly sceneViewSnapshotEmitter = this._register(new Emitter<IJScene3DSceneViewSnapshot>());
	readonly onDidChangeSceneViewSnapshot: Event<IJScene3DSceneViewSnapshot> = this.sceneViewSnapshotEmitter.event;

	constructor(launch: IJScene3DViewportLaunch) {
		super();
		this._launch = launch;
		this.resource = URI.from({
			scheme: 'jscene3d-viewport',
			authority: encodeURIComponent(launch.connectionGeneration),
			path: `/${launch.projectGeneration}/${encodeURIComponent(launch.sceneAssetId)}/${launch.viewportId}`
		});
	}
	get launch(): IJScene3DViewportLaunch { return this._launch; }

	override get typeId(): string { return JScene3DViewportEditorInput.ID; }
	override get editorId(): string { return JScene3DViewportEditorInput.ID; }
	override getName(): string {
		return localize('jscene3dProjectViewportName', "{0} — {1}", this.launch.projectName, this.launch.sceneName);
	}
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }
	updateSceneViewSnapshot(snapshot: IJScene3DSceneViewSnapshot): boolean {
		if (this.launch.kind !== 'scene' || !isSceneViewSnapshot(snapshot)
			|| snapshot.sceneAssetId !== this.launch.sceneAssetId
			|| snapshot.revision <= this.launch.snapshot.revision) {
			return false;
		}
		this._launch = { ...this.launch, snapshot };
		this.sceneViewSnapshotEmitter.fire(snapshot);
		return true;
	}
	override matches(other: EditorInput | unknown): boolean {
		return other instanceof JScene3DViewportEditorInput && other.resource.toString() === this.resource.toString();
	}
}
