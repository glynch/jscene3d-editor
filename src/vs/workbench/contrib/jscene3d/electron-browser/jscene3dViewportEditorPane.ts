/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { jscene3dViewport } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IJScene3DViewportFailure, IJScene3DViewportFrameIdentity } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { JScene3DViewportEditorInput } from '../browser/jscene3dViewportEditorInput.js';
import { JScene3DViewportLifecycleAction, JScene3DViewportModel, JScene3DViewportStopGate, physicalViewportSize, synchronizeCanvasBackingStore } from '../browser/jscene3dViewportModel.js';

/** Presents one project world from the native JScene3D renderer without browser-side scene rendering. */
export class JScene3DViewportEditorPane extends EditorPane {
	static readonly ID = 'workbench.editor.jscene3dRendererPreview';

	private readonly paneId = generateUuid();
	private model = new JScene3DViewportModel();
	private canvas: HTMLCanvasElement | undefined;
	private errorElement: HTMLElement | undefined;
	private context: GPUCanvasContext | undefined;
	private device: GPUDevice | undefined;
	private pipeline: GPURenderPipeline | undefined;
	private bindGroupLayout: GPUBindGroupLayout | undefined;
	private sampler: GPUSampler | undefined;
	private resizeObserver: ResizeObserver | undefined;
	private resizeTimer: number | undefined;
	private inputDisposeListener: IDisposable | undefined;
	private readonly sceneViewUpdateListener = this._register(new MutableDisposable<IDisposable>());
	private readonly stopGate = new JScene3DViewportStopGate();
	private registered = false;
	private startToken = 0;
	private disposed = false;

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
				void this.stop(false);
			}
		}));
		this._register(lifecycleService.onWillShutdown(event => {
			if (this.registered || this.stopGate.current) {
				event.join(this.stop(false), {
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
		this.applyLifecycleAction(this.model.setVisible(visible));
		if (visible) {
			this.scheduleResize();
		}
	}

	override async setInput(input: JScene3DViewportEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.sceneViewUpdateListener.value = input.onDidChangeSceneViewSnapshot(snapshot => {
			const session = this.model.sessionIdentity;
			if (session) {
				jscene3dViewport.updateSceneView(this.paneId, session, snapshot);
			}
		});
		let tokenValue = ++this.startToken;
		if (token.isCancellationRequested || !this.canvas) {
			return;
		}
		if (this.stopGate.current) {
			await this.stopGate.current;
			if (token.isCancellationRequested) {
				return;
			}
			tokenValue = ++this.startToken;
		}
		if (this.registered) {
			this.applyLifecycleAction(this.model.setVisible(this.isVisible()));
			return;
		}

		try {
			this.hideFailure();
			await this.initializeWebGPU();
			if (token.isCancellationRequested || tokenValue !== this.startToken) {
				return;
			}
			const size = this.currentSize();
			if (!size) {
				throw new Error(localize('jscene3dNativeViewportNoSize', "The viewport has no visible size."));
			}
			synchronizeCanvasBackingStore(this.canvas, size);
			jscene3dViewport.registerPane(
				this.paneId,
				async (frame, identity) => this.presentFrame(frame, identity),
				failure => this.onFailure(failure)
			);
			this.registered = true;
			this.inputDisposeListener = input.onWillDispose(() => { void this.stop(false); });
			this.model.setVisible(this.isVisible());
			const session = await jscene3dViewport.start(this.paneId, input.launch, size.width, size.height);
			if (token.isCancellationRequested || tokenValue !== this.startToken) {
				await this.stop(false);
				return;
			}
			this.applyLifecycleAction(this.model.bindSession(session));
			if (this.model.requestResize(size)) {
				jscene3dViewport.resize(this.paneId, session, size.width, size.height);
			}
		} catch (error) {
			this.showFailure(error instanceof Error ? error.message : String(error));
			await this.stop(true);
		}
	}

	override clearInput(): void {
		this.sceneViewUpdateListener.clear();
		void this.stop(false);
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
			if (this.model.isTerminal) {
				return;
			}
			const size = this.currentSize();
			if (!size) {
				return;
			}
			if (this.canvas) {
				synchronizeCanvasBackingStore(this.canvas, size);
			}
			const session = this.model.sessionIdentity;
			if (!session || !this.model.requestResize(size)) {
				return;
			}
			jscene3dViewport.resize(this.paneId, session, size.width, size.height);
		}, 75);
	}

	private applyLifecycleAction(action: JScene3DViewportLifecycleAction | undefined): void {
		const session = this.model.sessionIdentity;
		if (!session || !action) {
			return;
		}
		switch (action) {
			case 'pause':
				jscene3dViewport.pause(this.paneId, session);
				break;
			case 'resume':
				jscene3dViewport.resume(this.paneId, session);
				break;
			case 'stop':
				void this.stop(true);
				break;
		}
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
				module: device.createShaderModule({ code: `
					struct VertexOutput {
						@builtin(position) position: vec4<f32>,
						@location(0) texCoord: vec2<f32>
					};
					@vertex fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
						var positions = array<vec2<f32>, 6>(
							vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
							vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
						var coordinates = array<vec2<f32>, 6>(
							vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
							vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0));
						var output: VertexOutput;
						output.position = vec4<f32>(positions[index], 0.0, 1.0);
						output.texCoord = coordinates[index];
						return output;
					}` }),
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
		void device.lost.then(info => this.onFailure({ paneId: this.paneId, message: info.message || localize('jscene3dNativeViewportDeviceLost', "The WebGPU device was lost.") }));
	}

	private async presentFrame(frame: VideoFrame, identity: IJScene3DViewportFrameIdentity): Promise<void> {
		const device = this.device;
		const context = this.context;
		const pipeline = this.pipeline;
		const bindGroupLayout = this.bindGroupLayout;
		const sampler = this.sampler;
		if (!this.model.acceptsRendererWork || !device || !context || !pipeline || !bindGroupLayout || !sampler || !this.isVisible()) {
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
	}

	private onFailure(failure: IJScene3DViewportFailure): void {
		if (this.model.isTerminal) {
			return;
		}
		this.showFailure(failure.message);
		this.applyLifecycleAction(this.model.fail());
	}

	private showFailure(detail: string): void {
		if (this.errorElement) {
			this.errorElement.textContent = localize('jscene3dNativeViewportFailure', "The native viewport stopped: {0}", detail);
			this.errorElement.style.display = 'flex';
		}
	}

	private hideFailure(): void {
		if (this.errorElement) {
			this.errorElement.style.display = 'none';
			this.errorElement.textContent = '';
		}
	}

	private stop(preserveFailure: boolean): Promise<void> {
		return this.stopGate.run(async () => {
			this.startToken++;
			if (this.resizeTimer !== undefined) {
				this.window.clearTimeout(this.resizeTimer);
				this.resizeTimer = undefined;
			}
			const session = this.model.sessionIdentity;
			this.model.dispose();
			this.inputDisposeListener?.dispose();
			this.inputDisposeListener = undefined;
			try {
				if (this.registered) {
					await jscene3dViewport.stop(this.paneId, session);
				}
			} finally {
				if (this.registered) {
					jscene3dViewport.unregisterPane(this.paneId);
				}
				this.registered = false;
				if (!this.disposed) {
					this.model = new JScene3DViewportModel();
				}
				if (!preserveFailure) {
					this.hideFailure();
				}
			}
		});
	}

	override dispose(): void {
		this.disposed = true;
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;
		void this.stop(false);
		this.device?.destroy();
		this.device = undefined;
		super.dispose();
	}
}
