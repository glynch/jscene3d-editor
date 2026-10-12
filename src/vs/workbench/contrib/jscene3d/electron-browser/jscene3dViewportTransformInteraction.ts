/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IJScene3DTransformPointer, JScene3DTransformTool } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';

/** Owns one transform pointer from canvas press through window-routed completion. */
export class JScene3DViewportTransformInteraction extends Disposable {
	private pointerId: number | undefined;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly transform: (pointer: IJScene3DTransformPointer) => void
	) {
		super();
		const hostWindow = canvas.ownerDocument.defaultView!;
		this._register(addDisposableListener(hostWindow, EventType.POINTER_MOVE, event => this.onPointerMove(event), { capture: true }));
		this._register(addDisposableListener(hostWindow, EventType.POINTER_UP, event => this.onPointerUp(event), { capture: true }));
		this._register(addDisposableListener(hostWindow, 'pointercancel', event => this.onPointerCancel(event), { capture: true }));
		this._register(addDisposableListener(hostWindow, EventType.BLUR, () => this.cancel()));
	}

	/** Updates transform-ready cursor presentation for the active persistent tool. */
	setTool(active: boolean, tool: JScene3DTransformTool): void {
		if (active && tool !== 'select') {
			this.canvas.dataset.transformTool = tool;
		} else {
			delete this.canvas.dataset.transformTool;
		}
	}

	/** Begins ownership of one primary-button transform pointer. */
	begin(event: PointerEvent): void {
		event.preventDefault();
		this.canvas.setPointerCapture(event.pointerId);
		this.pointerId = event.pointerId;
		this.canvas.classList.add('is-transform-dragging');
		this.send('begin', event);
	}

	/** Updates renderer-owned handle hover state without beginning a transaction. */
	hover(event: PointerEvent): void {
		this.send('hover', event);
	}

	/** Reports whether a transform pointer is currently owned. */
	dragging(): boolean {
		return this.pointerId !== undefined;
	}

	/** Cancels and restores the active transform transaction, if any. */
	cancel(): void {
		const activePointer = this.pointerId;
		if (activePointer === undefined) {
			return;
		}
		this.transform({ phase: 'cancel', horizontal: 0, vertical: 0, ...this.viewportSize() });
		this.finish(activePointer);
	}

	override dispose(): void {
		this.cancel();
		super.dispose();
	}

	private onPointerMove(event: PointerEvent): void {
		if (this.pointerId !== event.pointerId) {
			return;
		}
		this.claim(event);
		if ((event.buttons & 1) === 0) {
			this.cancel();
			return;
		}
		this.send('update', event);
	}

	private onPointerUp(event: PointerEvent): void {
		if (this.pointerId !== event.pointerId) {
			return;
		}
		this.claim(event);
		this.send('commit', event);
		this.finish(event.pointerId);
	}

	private onPointerCancel(event: PointerEvent): void {
		if (this.pointerId !== event.pointerId) {
			return;
		}
		this.claim(event);
		this.cancel();
	}

	private claim(event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
	}

	private finish(activePointer: number): void {
		this.pointerId = undefined;
		this.canvas.classList.remove('is-transform-dragging');
		if (this.canvas.hasPointerCapture(activePointer)) {
			this.canvas.releasePointerCapture(activePointer);
		}
	}

	private send(phase: IJScene3DTransformPointer['phase'], event: PointerEvent): void {
		const point = this.physicalPoint(event);
		this.transform({ phase, horizontal: point.x, vertical: point.y, ...this.viewportSize() });
	}

	private physicalPoint(event: PointerEvent): { x: number; y: number } {
		const bounds = this.canvas.getBoundingClientRect();
		return {
			x: (event.clientX - bounds.left) * this.canvas.width / bounds.width,
			y: (event.clientY - bounds.top) * this.canvas.height / bounds.height
		};
	}

	private viewportSize(): { viewportWidth: number; viewportHeight: number } {
		return { viewportWidth: Math.max(1, this.canvas.width), viewportHeight: Math.max(1, this.canvas.height) };
	}
}
