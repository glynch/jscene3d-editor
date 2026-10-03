/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJScene3DViewportSessionIdentity } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';

export interface IJScene3DViewportSize {
	readonly width: number;
	readonly height: number;
}

/** Fullscreen-quad coordinates for presenting a top-left-origin external texture. */
export const jscene3dViewportTextureCoordinates = [
	[0, 0], [1, 0], [0, 1],
	[0, 1], [1, 0], [1, 1]
] as const;

/** Produces the WebGPU vertex shader used by the native viewport presentation pass. */
export function jscene3dViewportVertexShader(): string {
	const coordinates = jscene3dViewportTextureCoordinates
		.map(([x, y]) => `vec2<f32>(${x.toFixed(1)}, ${y.toFixed(1)})`)
		.join(', ');
	return `
		struct VertexOutput {
			@builtin(position) position: vec4<f32>,
			@location(0) texCoord: vec2<f32>
		};
		@vertex fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
			var positions = array<vec2<f32>, 6>(
				vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
				vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
			var coordinates = array<vec2<f32>, 6>(${coordinates});
			var output: VertexOutput;
			output.position = vec4<f32>(positions[index], 0.0, 1.0);
			output.texCoord = coordinates[index];
			return output;
		}`;
}

export type JScene3DViewportLifecycleAction = 'pause' | 'resume' | 'stop';

/** Coalesces concurrent stops without retaining a completed operation. */
export class JScene3DViewportStopGate {
	private stopping: Promise<void> | undefined;

	get current(): Promise<void> | undefined {
		return this.stopping;
	}

	run(operation: () => Promise<void>): Promise<void> {
		if (this.stopping) {
			return this.stopping;
		}
		const stopping = operation();
		this.stopping = stopping;
		const clear = () => {
			if (this.stopping === stopping) {
				this.stopping = undefined;
			}
		};
		void stopping.then(clear, clear);
		return stopping;
	}
}

export function physicalViewportSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): IJScene3DViewportSize | undefined {
	if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || !Number.isFinite(devicePixelRatio)
		|| cssWidth <= 0 || cssHeight <= 0 || devicePixelRatio <= 0) {
		return undefined;
	}
	return {
		width: Math.min(16384, Math.max(1, Math.round(cssWidth * devicePixelRatio))),
		height: Math.min(16384, Math.max(1, Math.round(cssHeight * devicePixelRatio)))
	};
}

export function synchronizeCanvasBackingStore(canvas: Pick<HTMLCanvasElement, 'width' | 'height'>, size: IJScene3DViewportSize): boolean {
	if (canvas.width === size.width && canvas.height === size.height) {
		return false;
	}
	canvas.width = size.width;
	canvas.height = size.height;
	return true;
}

interface IJScene3DViewportFrameElement {
	readonly style: Pick<CSSStyleDeclaration, 'visibility'>;
}

/** Prevents an earlier Scene's submitted canvas texture from becoming visible after an input switch. */
export class JScene3DViewportFrameGate {
	private generation = 0;

	/** Hides the currently presented texture and invalidates pending reveals. */
	hide(frameElement: IJScene3DViewportFrameElement): void {
		this.generation++;
		frameElement.style.visibility = 'hidden';
	}

	/** Captures the active presentation generation before submitting a frame. */
	capture(): number {
		return this.generation;
	}

	/** Reveals a submitted frame only if no newer Scene input has hidden the canvas. */
	reveal(frameElement: IJScene3DViewportFrameElement, generation: number): boolean {
		if (generation !== this.generation) {
			return false;
		}
		frameElement.style.visibility = 'visible';
		return true;
	}
}

/** Tracks the renderer-independent lifecycle state of one concrete viewport pane. */
export class JScene3DViewportModel {
	private session: IJScene3DViewportSessionIdentity | undefined;
	private lastRequestedSize: IJScene3DViewportSize | undefined;
	private visible = false;
	private failed = false;
	private disposed = false;

	bindSession(session: IJScene3DViewportSessionIdentity): JScene3DViewportLifecycleAction | undefined {
		if (this.disposed || this.failed || this.session) {
			return undefined;
		}
		this.session = session;
		return this.visible ? 'resume' : 'pause';
	}

	setVisible(visible: boolean): JScene3DViewportLifecycleAction | undefined {
		if (this.disposed || this.failed || this.visible === visible) {
			return undefined;
		}
		this.visible = visible;
		if (!this.session) {
			return undefined;
		}
		return visible ? 'resume' : 'pause';
	}

	requestResize(size: IJScene3DViewportSize): boolean {
		if (this.disposed || this.failed || !this.session || size.width <= 0 || size.height <= 0) {
			return false;
		}
		if (this.lastRequestedSize?.width === size.width && this.lastRequestedSize.height === size.height) {
			return false;
		}
		this.lastRequestedSize = size;
		return true;
	}

	fail(): JScene3DViewportLifecycleAction | undefined {
		if (this.disposed || this.failed) {
			return undefined;
		}
		this.failed = true;
		return this.session ? 'stop' : undefined;
	}

	dispose(): JScene3DViewportLifecycleAction | undefined {
		if (this.disposed) {
			return undefined;
		}
		this.disposed = true;
		return this.session ? 'stop' : undefined;
	}

	get sessionIdentity(): IJScene3DViewportSessionIdentity | undefined {
		return this.session;
	}

	get isTerminal(): boolean {
		return this.disposed || this.failed;
	}

	get acceptsRendererWork(): boolean {
		return !this.isTerminal && this.session !== undefined;
	}
}
