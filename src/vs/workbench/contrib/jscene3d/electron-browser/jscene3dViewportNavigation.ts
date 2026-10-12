/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IJScene3DSceneViewNavigation, IJScene3DTransformPointer, IJScene3DTransformSettings, JScene3DTransformSpace, JScene3DTransformTool } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IJScene3DViewportGestureSettings, isJScene3DViewportWheelZoomEnabled, JScene3DViewportDragAction, resolveJScene3DViewportDragAction } from '../browser/jscene3dViewportNavigationBindings.js';
import { JScene3DViewportToolbars } from './jscene3dViewportToolbars.js';
import { JScene3DViewportTransformInteraction } from './jscene3dViewportTransformInteraction.js';

const SETTING_PREFIX = 'jscene3d.sceneView.navigation';
const TRANSFORM_SETTING_PREFIX = 'jscene3d.sceneView.transform';
const GIZMO_WIDTH = 238;
const GIZMO_HEIGHT = 202;
const GIZMO_MARGIN = 26;

interface DragState {
	readonly pointerId: number;
	readonly action: JScene3DViewportDragAction;
	readonly gizmo: boolean;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	moved: boolean;
}

/** Adapts configurable workbench gestures and overlay controls to renderer-owned camera commands. */
export class JScene3DViewportNavigation extends Disposable {
	private readonly toolbars: JScene3DViewportToolbars;
	private readonly transformInteraction: JScene3DViewportTransformInteraction;
	private drag: DragState | undefined;
	private tool: JScene3DTransformTool = 'select';
	private space: JScene3DTransformSpace = 'global';
	private snapping = false;
	private active = false;

	constructor(
		parent: HTMLElement,
		private readonly canvas: HTMLCanvasElement,
		private readonly configurationService: IConfigurationService,
		private readonly navigate: (navigation: IJScene3DSceneViewNavigation) => void,
		private readonly select: (horizontal: number, vertical: number) => void,
		private readonly configureTransform: (settings: IJScene3DTransformSettings) => void,
		transform: (pointer: IJScene3DTransformPointer) => void
	) {
		super();
		this.canvas.classList.add('jscene3d-scene-viewport');
		const pixelRatio = parent.ownerDocument.defaultView?.devicePixelRatio || 1;
		this.toolbars = this._register(new JScene3DViewportToolbars(parent, (GIZMO_HEIGHT + GIZMO_MARGIN) / pixelRatio + 8, {
			beginDrag: (event, action) => this.beginDrag(event, action, false),
			continueDrag: event => this.onPointerMove(event),
			endDrag: event => this.finishToolbarPointer(event),
			toggleProjection: () => this.navigate({ kind: 'toggleProjection' }),
			selectTool: tool => this.selectTool(tool),
			toggleSnapping: () => this.setSnapping(!this.snapping),
			toggleSpace: () => this.setSpace(this.space === 'global' ? 'local' : 'global')
		}));
		this.transformInteraction = this._register(new JScene3DViewportTransformInteraction(canvas, transform));
		this.registerCanvasInput();
		const hostWindow = parent.ownerDocument.defaultView!;
		this._register(addDisposableListener(hostWindow, EventType.KEY_DOWN, event => this.onKeyDown(event)));
		this.updateTransformConfiguration();
		this.setActive(false);
	}

	/** Shows controls only while a safe authored Scene View is active. */
	setActive(active: boolean): void {
		this.active = active;
		this.toolbars.setActive(active);
		if (active) {
			this.updateTransformConfiguration();
		} else {
			this.cancelTransform();
			this.clearDragPresentation();
		}
		this.transformInteraction.setTool(active, this.tool);
	}

	/** Selects one persistent entity tool through the command/keybinding service. */
	selectTransformTool(tool: JScene3DTransformTool): void {
		if (this.active) {
			this.selectTool(tool);
		}
	}

	private registerCanvasInput(): void {
		this._register(addDisposableListener(this.canvas, EventType.POINTER_DOWN, event => this.onPointerDown(event)));
		this._register(addDisposableListener(this.canvas, EventType.POINTER_MOVE, event => this.onPointerMove(event)));
		this._register(addDisposableListener(this.canvas, EventType.POINTER_UP, event => this.onPointerUp(event)));
		this._register(addDisposableListener(this.canvas, 'pointercancel', event => this.finishPointer(event)));
		this._register(addDisposableListener(this.canvas, EventType.POINTER_LEAVE, () => {
			if (!this.drag) {
				this.canvas.classList.remove('is-gizmo-hover');
			}
		}));
		this._register(addDisposableListener(this.canvas, EventType.WHEEL, event => this.onWheel(event), { passive: false }));
		this._register(addDisposableListener(this.canvas, EventType.CONTEXT_MENU, event => {
			if (this.active && event.altKey) {
				event.preventDefault();
			}
		}));
	}

	private onPointerDown(event: PointerEvent): void {
		if (!this.active) {
			return;
		}
		const gizmo = event.button === 0 && this.isInsideGizmo(event);
		if (!gizmo && event.button === 0 && this.tool !== 'select' && !event.altKey && !event.shiftKey) {
			this.transformInteraction.begin(event);
			return;
		}
		const action = gizmo ? 'orbit' : this.configuredDragAction(event);
		if (!action) {
			return;
		}
		event.preventDefault();
		this.canvas.setPointerCapture(event.pointerId);
		this.beginDrag(event, action, gizmo);
	}

	private beginDrag(event: PointerEvent, action: JScene3DViewportDragAction, gizmo: boolean): void {
		this.drag = {
			pointerId: event.pointerId,
			action,
			gizmo,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			moved: false
		};
		this.canvas.dataset.navigationAction = action;
		this.canvas.classList.remove('is-gizmo-hover');
		this.toolbars.setNavigationInteraction(action);
	}

	private onPointerMove(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag) {
			this.canvas.classList.toggle('is-gizmo-hover', this.active && this.isInsideGizmo(event));
			if (this.active && this.tool !== 'select' && !this.isInsideGizmo(event)) {
				this.transformInteraction.hover(event);
			}
			return;
		}
		if (drag.pointerId !== event.pointerId) {
			return;
		}
		const horizontal = event.clientX - drag.lastX;
		const vertical = event.clientY - drag.lastY;
		drag.lastX = event.clientX;
		drag.lastY = event.clientY;
		drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 2;
		if (!drag.moved || (horizontal === 0 && vertical === 0)) {
			return;
		}
		event.preventDefault();
		this.sendDrag(drag.action, horizontal, vertical);
	}

	private onPointerUp(event: PointerEvent): void {
		const drag = this.drag;
		if (drag?.pointerId === event.pointerId && drag.gizmo && !drag.moved) {
			const point = this.physicalPoint(event);
			if (this.isInsideGizmoCenter(point.x, point.y)) {
				this.toolbars.toggleProjectionPresentation();
			}
			this.navigate({ kind: 'gizmoClick', horizontal: point.x, vertical: point.y, ...this.viewportSize() });
		} else if (!drag && this.active && event.button === 0) {
			const bounds = this.canvas.getBoundingClientRect();
			if (bounds.width > 0 && bounds.height > 0) {
				this.select(((event.clientX - bounds.left) / bounds.width) * 2 - 1, 1 - ((event.clientY - bounds.top) / bounds.height) * 2);
			}
		}
		this.finishPointer(event);
	}

	private finishPointer(event: PointerEvent): void {
		if (this.drag?.pointerId === event.pointerId) {
			this.clearDragPresentation();
			if (this.canvas.hasPointerCapture(event.pointerId)) {
				this.canvas.releasePointerCapture(event.pointerId);
			}
		}
	}

	private finishToolbarPointer(event: PointerEvent): void {
		if (this.drag?.pointerId === event.pointerId) {
			this.clearDragPresentation();
		}
	}

	private clearDragPresentation(): void {
		this.drag = undefined;
		delete this.canvas.dataset.navigationAction;
		this.toolbars.setNavigationInteraction(undefined);
	}

	private onWheel(event: WheelEvent): void {
		if (!this.active || !isJScene3DViewportWheelZoomEnabled(event.ctrlKey, this.gestureSettings())) {
			return;
		}
		event.preventDefault();
		const direction = this.setting('invertZoom', false) ? -1 : 1;
		this.navigate({ kind: 'zoom', amount: event.deltaY * this.setting('zoomSensitivity', 1) * direction });
	}

	private configuredDragAction(event: PointerEvent): JScene3DViewportDragAction | undefined {
		return resolveJScene3DViewportDragAction(event, this.gestureSettings());
	}

	private sendDrag(action: JScene3DViewportDragAction, horizontal: number, vertical: number): void {
		const bounds = this.canvas.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0) {
			return;
		}
		const physicalHorizontal = horizontal * this.canvas.width / bounds.width;
		const physicalVertical = vertical * this.canvas.height / bounds.height;
		if (action === 'zoom') {
			const direction = this.setting('invertZoom', false) ? -1 : 1;
			this.navigate({ kind: 'zoom', amount: physicalVertical * 8 * this.setting('zoomSensitivity', 1) * direction });
			return;
		}
		const sensitivity = this.setting(`${action}Sensitivity`, 1);
		const direction = action === 'orbit' && this.setting('invertOrbit', false) ? -1 : 1;
		this.navigate({
			kind: action,
			horizontal: physicalHorizontal * sensitivity * direction,
			vertical: physicalVertical * sensitivity * direction,
			...this.viewportSize()
		});
	}

	private viewportSize(): { viewportWidth: number; viewportHeight: number } {
		return { viewportWidth: Math.max(1, this.canvas.width), viewportHeight: Math.max(1, this.canvas.height) };
	}

	private physicalPoint(event: PointerEvent): { x: number; y: number } {
		const bounds = this.canvas.getBoundingClientRect();
		return { x: (event.clientX - bounds.left) * this.canvas.width / bounds.width, y: (event.clientY - bounds.top) * this.canvas.height / bounds.height };
	}

	private isInsideGizmo(event: PointerEvent): boolean {
		const point = this.physicalPoint(event);
		return point.x >= this.canvas.width - GIZMO_WIDTH - GIZMO_MARGIN && point.x <= this.canvas.width - GIZMO_MARGIN
			&& point.y >= GIZMO_MARGIN && point.y <= GIZMO_MARGIN + GIZMO_HEIGHT;
	}

	private isInsideGizmoCenter(horizontal: number, vertical: number): boolean {
		const centerX = this.canvas.width - GIZMO_MARGIN - GIZMO_WIDTH / 2;
		const centerY = GIZMO_MARGIN + 84;
		return Math.abs(horizontal - centerX) <= 28 && Math.abs(vertical - centerY) <= 28;
	}

	private setting<T>(name: string, fallback: T): T {
		return this.configurationService.getValue<T>(`${SETTING_PREFIX}.${name}`) ?? fallback;
	}

	private gestureSettings(): IJScene3DViewportGestureSettings {
		return {
			altDragOrbitEnabled: this.setting('altDragOrbitEnabled', true),
			shiftAltDragPanEnabled: this.setting('shiftAltDragPanEnabled', true),
			middleButtonPanEnabled: this.setting('middleButtonPanEnabled', true),
			scrollZoomEnabled: this.setting('scrollZoomEnabled', true),
			pinchZoomEnabled: this.setting('pinchZoomEnabled', true),
			altRightDragZoomEnabled: this.setting('altRightDragZoomEnabled', true)
		};
	}

	private selectTool(tool: JScene3DTransformTool): void {
		if (this.tool === tool) {
			return;
		}
		this.cancelTransform();
		this.tool = tool;
		this.updateTransformConfiguration();
		this.transformInteraction.setTool(this.active, tool);
	}

	private setSpace(space: JScene3DTransformSpace): void {
		this.cancelTransform();
		this.space = space;
		this.updateTransformConfiguration();
	}

	private setSnapping(snapping: boolean): void {
		this.cancelTransform();
		this.snapping = snapping;
		this.updateTransformConfiguration();
	}

	private updateTransformConfiguration(): void {
		const settings: IJScene3DTransformSettings = {
			tool: this.tool,
			space: this.space,
			snapping: this.snapping,
			translationSnap: this.transformSetting('translationSnap', 0.5),
			rotationSnap: this.transformSetting('rotationSnap', 15),
			scaleSnap: this.transformSetting('scaleSnap', 0.1)
		};
		this.toolbars.setTransformState(this.tool, this.space, this.snapping);
		this.configureTransform(settings);
	}

	private cancelTransform(): void {
		this.transformInteraction.cancel();
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (!this.active || event.metaKey || event.ctrlKey || event.altKey || isTextInput(event.target)) {
			return;
		}
		if (event.key === 'Escape' && this.transformInteraction.dragging()) {
			event.preventDefault();
			this.cancelTransform();
			return;
		}
	}

	private transformSetting(name: string, fallback: number): number {
		const value = this.configurationService.getValue<number>(`${TRANSFORM_SETTING_PREFIX}.${name}`);
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
	}
}

function isTextInput(target: EventTarget | null): boolean {
	return isHTMLElement(target) && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
}
