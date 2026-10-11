/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { JScene3DViewportDragAction } from '../browser/jscene3dViewportNavigationBindings.js';
import './media/jscene3dViewport.css';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

interface JScene3DViewportToolbarCallbacks {
	readonly beginDrag: (event: PointerEvent, action: JScene3DViewportDragAction) => void;
	readonly continueDrag: (event: PointerEvent) => void;
	readonly endDrag: (event: PointerEvent) => void;
	readonly toggleProjection: () => void;
}

/** Owns the presentation and transient interaction state of the Scene View overlay toolbars. */
export class JScene3DViewportToolbars extends Disposable {
	private readonly toolbars: HTMLElement[];
	private readonly navigationButtons = new Map<JScene3DViewportDragAction, HTMLButtonElement>();
	private readonly projectionButton: HTMLButtonElement;
	private projection: 'perspective' | 'orthographic' = 'perspective';

	constructor(parent: HTMLElement, rightTop: number, callbacks: JScene3DViewportToolbarCallbacks) {
		super();
		const top = this.createToolbar(parent, 'top', localize('jscene3dSceneViewTopToolbar', "Scene View display toolbar"));
		const left = this.createToolbar(parent, 'left', localize('jscene3dSceneViewToolsToolbar', "Scene View tools"));
		const right = this.createToolbar(parent, 'right', localize('jscene3dSceneViewNavigationToolbar', "Scene View navigation"));
		right.style.top = `${rightTop}px`;
		this.toolbars = [top, left, right];

		this.populateEntityTools(left);
		this.populateDisplayTools(top);
		this.projectionButton = this.populateNavigationTools(right, callbacks);
		this.updateProjectionPresentation();
	}

	/** Shows the overlay controls only for an active authored Scene View. */
	setActive(active: boolean): void {
		for (const toolbar of this.toolbars) {
			toolbar.classList.toggle('is-visible', active);
		}
		if (!active) {
			this.setNavigationInteraction(undefined);
		}
	}

	/** Highlights exactly the temporary navigation action currently being dragged. */
	setNavigationInteraction(action: JScene3DViewportDragAction | undefined): void {
		for (const [candidate, button] of this.navigationButtons) {
			const active = candidate === action;
			button.classList.toggle('is-dragging', active);
			button.setAttribute('aria-pressed', String(active));
		}
	}

	/** Mirrors a successful projection toggle in the button's icon and accessibility state. */
	toggleProjectionPresentation(): void {
		this.projection = this.projection === 'perspective' ? 'orthographic' : 'perspective';
		this.updateProjectionPresentation();
	}

	private populateEntityTools(toolbar: HTMLElement): void {
		this.addCodiconButton(toolbar, Codicon.cursor, localize('jscene3dSceneViewSelect', "Select (Q)"), true, undefined, true);
		this.addCodiconButton(toolbar, Codicon.move, localize('jscene3dSceneViewMove', "Move (W)"), false);
		this.addCodiconButton(toolbar, Codicon.sync, localize('jscene3dSceneViewRotate', "Rotate (E)"), false);
		this.addCodiconButton(toolbar, Codicon.screenFull, localize('jscene3dSceneViewScale', "Scale (R)"), false);
		this.addCodiconButton(toolbar, Codicon.selection, localize('jscene3dSceneViewRect', "Rect / Bounds (T)"), false);
	}

	private populateDisplayTools(toolbar: HTMLElement): void {
		this.addTextButton(toolbar, localize('jscene3dSceneViewShaded', "Shaded"), false, true);
		this.addTextButton(toolbar, localize('jscene3dSceneViewGrid', "Grid"), false, true);
		this.addTextButton(toolbar, localize('jscene3dSceneViewSnap', "Snap"), false);
		this.addTextButton(toolbar, localize('jscene3dSceneViewLocalGlobal', "Local / Global"), false);
		this.addCodiconButton(toolbar, Codicon.eye, localize('jscene3dSceneViewDisplayOptions', "Display Options"), false);
		this.addCodiconButton(toolbar, Codicon.ellipsis, localize('jscene3dSceneViewMore', "More"), false);
	}

	private populateNavigationTools(toolbar: HTMLElement, callbacks: JScene3DViewportToolbarCallbacks): HTMLButtonElement {
		this.addDragButton(toolbar, Codicon.sync, localize('jscene3dSceneViewOrbit', "Orbit"), 'orbit', callbacks);
		this.addDragButton(toolbar, this.createHandIcon(toolbar.ownerDocument), localize('jscene3dSceneViewPan', "Pan"), 'pan', callbacks);
		this.addDragButton(toolbar, Codicon.zoomIn, localize('jscene3dSceneViewZoom', "Zoom"), 'zoom', callbacks);
		const projection = this.addSvgButton(toolbar, this.createProjectionIcon(toolbar.ownerDocument), localize('jscene3dSceneViewProjection', "Toggle Perspective / Orthographic"), true, () => {
			this.toggleProjectionPresentation();
			callbacks.toggleProjection();
		});
		projection.classList.add('jscene3d-scene-toolbar-projection');
		return projection;
	}

	private createToolbar(parent: HTMLElement, placement: 'top' | 'left' | 'right', label: string): HTMLElement {
		const toolbar = parent.ownerDocument.createElement('div');
		toolbar.className = `jscene3d-scene-toolbar jscene3d-scene-toolbar-${placement}`;
		toolbar.setAttribute('role', 'toolbar');
		toolbar.setAttribute('aria-label', label);
		parent.appendChild(toolbar);
		return toolbar;
	}

	private addCodiconButton(toolbar: HTMLElement, icon: ThemeIcon, label: string, enabled: boolean, action?: () => void, selected = false): HTMLButtonElement {
		const button = this.createButton(toolbar, label, enabled, action, selected);
		button.classList.add(...ThemeIcon.asClassNameArray(icon));
		return button;
	}

	private addSvgButton(toolbar: HTMLElement, icon: SVGSVGElement, label: string, enabled: boolean, action?: () => void): HTMLButtonElement {
		const button = this.createButton(toolbar, label, enabled, action);
		button.appendChild(icon);
		return button;
	}

	private createButton(toolbar: HTMLElement, label: string, enabled: boolean, action?: () => void, selected = false): HTMLButtonElement {
		const button = toolbar.ownerDocument.createElement('button');
		button.type = 'button';
		button.className = 'jscene3d-scene-toolbar-button';
		button.title = label;
		button.setAttribute('aria-label', label);
		button.setAttribute('aria-pressed', String(selected));
		button.classList.toggle('is-selected', selected);
		button.disabled = !enabled;
		if (action) {
			this._register(addDisposableListener(button, EventType.CLICK, action));
		}
		toolbar.appendChild(button);
		return button;
	}

	private addTextButton(toolbar: HTMLElement, label: string, enabled: boolean, selected = false): void {
		const button = this.createButton(toolbar, label, enabled, undefined, selected);
		button.classList.add('jscene3d-scene-toolbar-text-button');
		button.textContent = label;
	}

	private addDragButton(toolbar: HTMLElement, icon: ThemeIcon | SVGSVGElement, label: string, action: JScene3DViewportDragAction, callbacks: JScene3DViewportToolbarCallbacks): void {
		const button = icon instanceof toolbar.ownerDocument.defaultView!.SVGSVGElement
			? this.addSvgButton(toolbar, icon, label, true)
			: this.addCodiconButton(toolbar, icon, label, true);
		button.classList.add('jscene3d-scene-toolbar-navigation-button', `is-${action}`);
		this.navigationButtons.set(action, button);
		this._register(addDisposableListener(button, EventType.POINTER_DOWN, event => {
			event.preventDefault();
			button.setPointerCapture(event.pointerId);
			this.setNavigationInteraction(action);
			callbacks.beginDrag(event, action);
		}));
		this._register(addDisposableListener(button, EventType.POINTER_MOVE, callbacks.continueDrag));
		const finish = (event: PointerEvent): void => {
			if (button.hasPointerCapture(event.pointerId)) {
				button.releasePointerCapture(event.pointerId);
			}
			this.setNavigationInteraction(undefined);
			callbacks.endDrag(event);
		};
		this._register(addDisposableListener(button, EventType.POINTER_UP, finish));
		this._register(addDisposableListener(button, 'pointercancel', finish));
	}

	private updateProjectionPresentation(): void {
		const orthographic = this.projection === 'orthographic';
		this.projectionButton.dataset.projection = this.projection;
		this.projectionButton.classList.toggle('is-selected', orthographic);
		this.projectionButton.setAttribute('aria-pressed', String(orthographic));
	}

	private createHandIcon(document: Document): SVGSVGElement {
		return this.createSvgIcon(document, 'jscene3d-scene-toolbar-hand', 'M7.5 10V5.5a1.25 1.25 0 0 1 2.5 0V9 4.5a1.25 1.25 0 0 1 2.5 0V9 5.5a1.25 1.25 0 0 1 2.5 0V10 7a1.25 1.25 0 0 1 2.5 0v6.2c0 3.6-2.4 6.3-6 6.3h-1.1c-2.2 0-3.8-.8-5.1-2.6L3 13.9a1.45 1.45 0 0 1 2.2-1.8L7.5 14');
	}

	private createProjectionIcon(document: Document): SVGSVGElement {
		const svg = this.createSvg(document, 'jscene3d-scene-toolbar-projection-icon');
		this.addSvgPath(svg, 'projection-perspective', 'M4 6.2 10.7 3l7.3 3.7-6.8 3.8L4 6.2Zm0 0v9.2l7.2 4.1v-9L4 6.2Zm7.2 4.3L18 6.7v9.1l-6.8 3.7v-9Z');
		this.addSvgPath(svg, 'projection-orthographic', 'M4 4h11v11H4V4Zm4 4h11v11H8V8Z');
		return svg;
	}

	private createSvgIcon(document: Document, className: string, path: string): SVGSVGElement {
		const svg = this.createSvg(document, className);
		this.addSvgPath(svg, '', path);
		return svg;
	}

	private createSvg(document: Document, className: string): SVGSVGElement {
		const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
		svg.classList.add('jscene3d-scene-toolbar-svg', className);
		svg.setAttribute('viewBox', '0 0 22 22');
		svg.setAttribute('aria-hidden', 'true');
		return svg;
	}

	private addSvgPath(svg: SVGSVGElement, className: string, data: string): void {
		const path = svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
		if (className) {
			path.classList.add(className);
		}
		path.setAttribute('d', data);
		svg.appendChild(path);
	}
}
