/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { jscene3dViewport } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IJScene3DViewportFrameIdentity } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { beginJScene3DViewportInput, IJScene3DViewportPresentation, JScene3DViewportEditorInput, JScene3DViewportStartupState } from '../browser/jscene3dViewportEditorInput.js';
import { JScene3DSceneEditorInput } from '../browser/jscene3dSceneEditorInput.js';
import { JScene3DViewportFrameGate, jscene3dViewportVertexShader, physicalViewportSize, synchronizeCanvasBackingStore } from '../browser/jscene3dViewportModel.js';

/** Presents one project world from the native JScene3D renderer without browser-side scene rendering. */
export class JScene3DViewportEditorPane extends EditorPane implements IJScene3DViewportPresentation {
	static readonly ID = 'workbench.editor.jscene3dRendererPreview';

	private canvas: HTMLCanvasElement | undefined;
	private errorElement: HTMLElement | undefined;
	private context: GPUCanvasContext | undefined;
	private device: GPUDevice | undefined;
	private pipeline: GPURenderPipeline | undefined;
	private bindGroupLayout: GPUBindGroupLayout | undefined;
	private sampler: GPUSampler | undefined;
	private resizeObserver: ResizeObserver | undefined;
	private resizeTimer: number | undefined;
	private readonly frameGate = new JScene3DViewportFrameGate();

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super(JScene3DViewportEditorPane.ID, group, telemetryService, themeService, storageService);
		this._register(group.onWillCloseEditor(event => {
			if (this.input && event.editor.matches(this.input)) {
				void this.viewportInput()?.stop();
			}
		}));
		this._register(lifecycleService.onWillShutdown(event => {
			const input = this.viewportInput();
			if (input) {
				event.join(input.stop(), {
					id: 'jscene3dNativeViewport',
					label: localize('jscene3dNativeViewportShutdown', "Stopping JScene3D native viewport")
				});
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		parent.style.position = 'relative';
		parent.style.overflow = 'hidden';
		parent.style.background = '#000';

		const canvas = parent.ownerDocument.createElement('canvas');
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
		canvas.style.visibility = 'hidden';
		canvas.setAttribute('aria-label', localize('jscene3dNativeViewportCanvas', "JScene3D native project viewport"));
		parent.appendChild(canvas);
		this.canvas = canvas;

		const errorElement = parent.ownerDocument.createElement('div');
		errorElement.style.position = 'absolute';
		errorElement.style.inset = '0';
		errorElement.style.display = 'none';
		errorElement.style.alignItems = 'center';
		errorElement.style.justifyContent = 'center';
		errorElement.style.padding = '24px';
		errorElement.style.textAlign = 'center';
		errorElement.style.color = 'var(--vscode-errorForeground)';
		errorElement.style.background = 'var(--vscode-editor-background)';
		errorElement.setAttribute('role', 'alert');
		parent.appendChild(errorElement);
		this.errorElement = errorElement;

		this.resizeObserver = new this.window.ResizeObserver(() => this.scheduleResize());
		this.resizeObserver.observe(canvas);
	}

	override layout(dimension: Dimension): void {
		if (this.canvas) {
			this.canvas.style.width = `${dimension.width}px`;
			this.canvas.style.height = `${dimension.height}px`;
			this.scheduleResize();
		}
	}

	protected override setEditorVisible(visible: boolean): void {
		this.viewportInput()?.setVisible(this, visible);
		if (visible) {
			this.scheduleResize();
		}
	}

	override async setInput(input: JScene3DViewportEditorInput | JScene3DSceneEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const viewport = this.viewportInput(input);
		beginJScene3DViewportInput(this, viewport?.startupState ?? 'renderer-starting');
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || !this.canvas) {
			return;
		}

		try {
			this.hideFailure();
			this.showStartupState(this.viewportInput(input)?.startupState ?? 'renderer-starting');
			await this.initializeWebGPU();
			if (token.isCancellationRequested) {
				return;
			}
			const size = this.currentSize();
			if (!size) {
				throw new Error(localize('jscene3dNativeViewportNoSize', "The viewport has no visible size."));
			}
			synchronizeCanvasBackingStore(this.canvas, size);
			if (viewport) {
				await viewport.attach(this, size, jscene3dViewport);
			}
		} catch (error) {
			this.showFailure(error instanceof Error ? error.message : String(error));
		}
	}

	override clearInput(): void {
		this.viewportInput()?.detach(this);
		super.clearInput();
	}

	private currentSize() {
		const bounds = this.canvas?.getBoundingClientRect();
		const devicePixelRatio = this.window.devicePixelRatio || 1;
		return bounds ? physicalViewportSize(bounds.width, bounds.height, devicePixelRatio) : undefined;
	}

	private scheduleResize(): void {
		if (this.resizeTimer !== undefined) {
			this.window.clearTimeout(this.resizeTimer);
		}
		this.resizeTimer = this.window.setTimeout(() => {
			this.resizeTimer = undefined;
			const size = this.currentSize();
			if (!size) {
				return;
			}
			if (this.canvas) {
				synchronizeCanvasBackingStore(this.canvas, size);
			}
			this.viewportInput()?.resize(this, size);
		}, 75);
	}

	private async initializeWebGPU(): Promise<void> {
		if (this.device) {
			return;
		}
		const canvas = this.canvas;
		const context = canvas?.getContext('webgpu');
		const adapter = await this.window.navigator.gpu?.requestAdapter();
		if (!canvas || !context || !adapter) {
			throw new Error(localize('jscene3dNativeViewportWebGPUUnavailable', "WebGPU is unavailable for the native viewport."));
		}
		const device = await adapter.requestDevice();
		const format = this.window.navigator.gpu.getPreferredCanvasFormat();
		context.configure({ device, format, alphaMode: 'opaque' });

		const bindGroupLayout = device.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
			]
		});
		const pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
			vertex: {
				module: device.createShaderModule({ code: jscene3dViewportVertexShader() }),
				entryPoint: 'main'
			},
			fragment: {
				module: device.createShaderModule({ code: `
					@group(0) @binding(0) var image: texture_external;
					@group(0) @binding(1) var imageSampler: sampler;
					@fragment fn main(@location(0) coordinate: vec2<f32>) -> @location(0) vec4<f32> {
						return textureSampleBaseClampToEdge(image, imageSampler, coordinate);
					}` }),
				entryPoint: 'main',
				targets: [{ format }]
			},
			primitive: { topology: 'triangle-list' }
		});

		this.context = context;
		this.device = device;
		this.bindGroupLayout = bindGroupLayout;
		this.pipeline = pipeline;
		this.sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
		void device.lost.then(info => {
			this.showFailure(info.message || localize('jscene3dNativeViewportDeviceLost', "The WebGPU device was lost."));
			void this.viewportInput()?.stop(true);
		});
	}

	async presentFrame(frame: VideoFrame, _identity: IJScene3DViewportFrameIdentity): Promise<void> {
		const framePresentationGeneration = this.frameGate.capture();
		const canvas = this.canvas;
		const device = this.device;
		const context = this.context;
		const pipeline = this.pipeline;
		const bindGroupLayout = this.bindGroupLayout;
		const sampler = this.sampler;
		if (!canvas || !device || !context || !pipeline || !bindGroupLayout || !sampler || !this.isVisible()) {
			return;
		}
		const bindGroup = device.createBindGroup({
			layout: bindGroupLayout,
			entries: [
				{ binding: 0, resource: device.importExternalTexture({ source: frame }) },
				{ binding: 1, resource: sampler }
			]
		});
		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [{
				view: context.getCurrentTexture().createView(),
				loadOp: 'clear',
				storeOp: 'store',
				clearValue: { r: 0, g: 0, b: 0, a: 1 }
			}]
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(6);
		pass.end();
		device.queue.submit([encoder.finish()]);
		if (canvas.style.visibility !== 'visible') {
			await device.queue.onSubmittedWorkDone();
			if (this.canvas === canvas && this.isVisible()) {
				this.frameGate.reveal(canvas, framePresentationGeneration);
			}
		}
	}

	resetFrame(): void {
		if (this.canvas) {
			this.frameGate.hide(this.canvas);
		}
	}

	showStartupState(state: JScene3DViewportStartupState): void {
		if (!this.errorElement || state === 'failed') {
			return;
		}
		if (state === 'rendered' || state === 'disposed') {
			this.hideFailure();
			return;
		}
		this.errorElement.textContent = state === 'renderer-starting'
			? localize('jscene3dNativeViewportStarting', "Starting renderer…")
			: localize('jscene3dNativeViewportWaitingForFrame', "Waiting for first frame…");
		this.errorElement.style.color = 'var(--vscode-foreground)';
		this.errorElement.style.display = 'flex';
		this.errorElement.setAttribute('role', 'status');
	}

	showFailure(detail: string): void {
		if (this.errorElement) {
			this.errorElement.textContent = localize('jscene3dNativeViewportFailure', "The native viewport stopped: {0}", detail);
			this.errorElement.style.color = 'var(--vscode-errorForeground)';
			this.errorElement.style.display = 'flex';
			this.errorElement.setAttribute('role', 'alert');
		}
	}

	hideFailure(): void {
		if (this.errorElement) {
			this.errorElement.style.display = 'none';
			this.errorElement.textContent = '';
		}
	}

	private viewportInput(input: JScene3DViewportEditorInput | JScene3DSceneEditorInput | undefined = this.input as JScene3DViewportEditorInput | JScene3DSceneEditorInput | undefined): JScene3DViewportEditorInput | undefined {
		return input instanceof JScene3DSceneEditorInput ? input.viewport : input;
	}

	override dispose(): void {
		this.viewportInput()?.detach(this);
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;
		this.device?.destroy();
		this.device = undefined;
		super.dispose();
	}
}
