/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IJScene3DTransformPointer, IJScene3DTransformSettings, JScene3DTransformSpace, JScene3DTransformTool } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { JScene3DViewportToolbars } from './jscene3dViewportToolbars.js';
import { JScene3DViewportTransformInteraction } from './jscene3dViewportTransformInteraction.js';

const TRANSFORM_SETTING_PREFIX = 'jscene3d.sceneView.transform';

/** Owns transform-tool state and coordinates one renderer-backed transform pointer interaction. */
export class JScene3DViewportTransformController extends Disposable {
	private readonly interaction: JScene3DViewportTransformInteraction;
	private tool: JScene3DTransformTool = 'select';
	private space: JScene3DTransformSpace = 'global';
	private snapping = false;
	private active = false;

	constructor(
		canvas: HTMLCanvasElement,
		private readonly toolbars: JScene3DViewportToolbars,
		private readonly configurationService: IConfigurationService,
		private readonly configure: (settings: IJScene3DTransformSettings) => void,
		transform: (pointer: IJScene3DTransformPointer) => void
	) {
		super();
		this.interaction = this._register(new JScene3DViewportTransformInteraction(canvas, transform));
		const hostWindow = canvas.ownerDocument.defaultView!;
		this._register(addDisposableListener(hostWindow, EventType.KEY_DOWN, event => this.onKeyDown(event)));
		this.updateConfiguration();
	}

	/** Enables transform input only while the owning authored Scene View is active. */
	setActive(active: boolean): void {
		this.active = active;
		if (active) {
			this.updateConfiguration();
		} else {
			this.cancel();
		}
		this.interaction.setTool(active, this.tool);
	}

	/** Selects one persistent entity transform tool. */
	selectTool(tool: JScene3DTransformTool): void {
		if (!this.active || this.tool === tool) {
			return;
		}
		this.cancel();
		this.tool = tool;
		this.updateConfiguration();
		this.interaction.setTool(true, tool);
	}

	/** Toggles translation, rotation, and scale snapping for subsequent interactions. */
	toggleSnapping(): void {
		this.cancel();
		this.snapping = !this.snapping;
		this.updateConfiguration();
	}

	/** Switches between local and global transform coordinates. */
	toggleSpace(): void {
		this.cancel();
		this.space = this.space === 'global' ? 'local' : 'global';
		this.updateConfiguration();
	}

	/** Returns whether a primary pointer press should begin an entity transform. */
	shouldBegin(event: PointerEvent, insideOrientationGizmo: boolean): boolean {
		return this.active && !insideOrientationGizmo && event.button === 0 && this.tool !== 'select' && !event.altKey && !event.shiftKey;
	}

	/** Begins one transform interaction after the viewport has assigned pointer ownership. */
	begin(event: PointerEvent): void {
		this.interaction.begin(event);
	}

	/** Updates renderer-owned handle hover state. */
	hover(event: PointerEvent, insideOrientationGizmo: boolean): void {
		if (this.active && this.tool !== 'select' && !insideOrientationGizmo) {
			this.interaction.hover(event);
		}
	}

	private cancel(): void {
		this.interaction.cancel();
	}

	private updateConfiguration(): void {
		const settings: IJScene3DTransformSettings = {
			tool: this.tool,
			space: this.space,
			snapping: this.snapping,
			translationSnap: this.setting('translationSnap', 0.5),
			rotationSnap: this.setting('rotationSnap', 15),
			scaleSnap: this.setting('scaleSnap', 0.1)
		};
		this.toolbars.setTransformState(this.tool, this.space, this.snapping);
		this.configure(settings);
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (!this.active || event.metaKey || event.ctrlKey || event.altKey || isTextInput(event.target)) {
			return;
		}
		if (event.key === 'Escape' && this.interaction.dragging()) {
			event.preventDefault();
			this.cancel();
		}
	}

	private setting(name: string, fallback: number): number {
		const value = this.configurationService.getValue<number>(`${TRANSFORM_SETTING_PREFIX}.${name}`);
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
	}
}

function isTextInput(target: EventTarget | null): boolean {
	return isHTMLElement(target) && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
}
