/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IJScene3DSceneViewNavigation } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IJScene3DViewportGestureSettings, isJScene3DViewportWheelZoomEnabled, JScene3DViewportDragAction, resolveJScene3DViewportDragAction } from '../browser/jscene3dViewportNavigationBindings.js';
import { JScene3DViewportToolbars } from './jscene3dViewportToolbars.js';

const SETTING_PREFIX = 'jscene3d.sceneView.navigation';
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
	private drag: DragState | undefined;
	private active = false;

	constructor(
		parent: HTMLElement,
		private readonly canvas: HTMLCanvasElement,
		private readonly configurationService: IConfigurationService,
		private readonly navigate: (navigation: IJScene3DSceneViewNavigation) => void,
		private readonly select: (horizontal: number, vertical: number) => void
	) {
		super();
		this.canvas.classList.add('jscene3d-scene-viewport');
		const pixelRatio = parent.ownerDocument.defaultView?.devicePixelRatio || 1;
		this.toolbars = this._register(new JScene3DViewportToolbars(parent, (GIZMO_HEIGHT + GIZMO_MARGIN) / pixelRatio + 8, {
			beginDrag: (event, action) => this.beginDrag(event, action, false),
			continueDrag: event => this.onPointerMove(event),
			endDrag: event => this.finishToolbarPointer(event),
			toggleProjection: () => this.navigate({ kind: 'toggleProjection' })
		}));
		this.registerCanvasInput();
		this.setActive(false);
	}

	/** Shows controls only while a safe authored Scene View is active. */
	setActive(active: boolean): void {
		this.active = active;
		this.toolbars.setActive(active);
		if (!active) {
			this.clearDragPresentation();
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
}
