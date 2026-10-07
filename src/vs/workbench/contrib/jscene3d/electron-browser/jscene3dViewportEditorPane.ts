/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, Dimension, EventType, isMouseEvent } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { jscene3dViewport } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IJScene3DViewportFrameIdentity, JSCENE3D_ACCEPT_SCENE_SELECTION_COMMAND_ID } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { beginJScene3DViewportInput, IJScene3DViewportPresentation, jscene3dViewportStartupPresentation, JScene3DViewportEditorInput, JScene3DViewportStartupState } from '../browser/jscene3dViewportEditorInput.js';
import { JScene3DSceneEditorInput } from '../browser/jscene3dSceneEditorInput.js';
import { JScene3DViewportFrameGate, jscene3dViewportVertexShader, physicalViewportSize, synchronizeCanvasBackingStore } from '../browser/jscene3dViewportModel.js';

/** Presents one project world from the native JScene3D renderer without browser-side scene rendering. */
export class JScene3DViewportEditorPane extends EditorPane implements IJScene3DViewportPresentation {
	static readonly ID = 'workbench.editor.jscene3dRendererPreview';

	private canvas: HTMLCanvasElement | undefined;
	private errorElement: HTMLElement | undefined;
	private spinnerElement: HTMLElement | undefined;
	private messageElement: HTMLElement | undefined;
	private context: GPUCanvasContext | undefined;
	private device: GPUDevice | undefined;
	private pipeline: GPURenderPipeline | undefined;
	private bindGroupLayout: GPUBindGroupLayout | undefined;
	private sampler: GPUSampler | undefined;
	private resizeObserver: ResizeObserver | undefined;
	private resizeTimer: number | undefined;
	private readonly frameGate = new JScene3DViewportFrameGate();
	private readonly selectionListener = this._register(new MutableDisposable());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ICommandService private readonly commandService: ICommandService
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
		this._register(addDisposableListener(canvas, EventType.CLICK, event => {
			if (!isMouseEvent(event) || event.button !== 0) {
				return;
			}
			const bounds = canvas.getBoundingClientRect();
			if (bounds.width <= 0 || bounds.height <= 0) {
				return;
			}
			this.viewportInput()?.selectAt(
				this,
				((event.clientX - bounds.left) / bounds.width) * 2 - 1,
				1 - ((event.clientY - bounds.top) / bounds.height) * 2
			);
		}));

		const errorElement = parent.ownerDocument.createElement('div');
		errorElement.style.position = 'absolute';
		errorElement.style.inset = '0';
		errorElement.style.display = 'none';
		errorElement.style.flexDirection = 'column';
		errorElement.style.alignItems = 'center';
		errorElement.style.justifyContent = 'center';
		errorElement.style.gap = '10px';
		errorElement.style.padding = '24px';
		errorElement.style.textAlign = 'center';
		errorElement.style.color = 'var(--vscode-errorForeground)';
		errorElement.style.background = 'var(--vscode-editor-background)';
		const spinnerElement = parent.ownerDocument.createElement('span');
		spinnerElement.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, 'spin')));
		spinnerElement.style.fontSize = '16px';
		spinnerElement.style.color = 'var(--vscode-descriptionForeground)';
		spinnerElement.setAttribute('aria-hidden', 'true');
		errorElement.appendChild(spinnerElement);
		this.spinnerElement = spinnerElement;

		const messageElement = parent.ownerDocument.createElement('span');
		errorElement.appendChild(messageElement);
		this.messageElement = messageElement;
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
		this.selectionListener.value = viewport?.onDidChangeSceneSelection(selection => {
			void this.commandService.executeCommand(JSCENE3D_ACCEPT_SCENE_SELECTION_COMMAND_ID, selection);
		});
		beginJScene3DViewportInput(this, viewport?.startupState ?? 'renderer-starting', viewport?.launch.kind ?? 'game');
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || !this.canvas) {
			return;
		}

		try {
			this.hideFailure();
			this.showStartupState(
				this.viewportInput(input)?.startupState ?? 'renderer-starting',
				this.viewportInput(input)?.launch.kind ?? 'game'
			);
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
		this.selectionListener.clear();
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

	async presentFrame(frame: VideoFrame, _identity: IJScene3DViewportFrameIdentity): Promise<boolean> {
		const framePresentationGeneration = this.frameGate.capture();
		const canvas = this.canvas;
		const device = this.device;
		const context = this.context;
		const pipeline = this.pipeline;
		const bindGroupLayout = this.bindGroupLayout;
		const sampler = this.sampler;
		if (!canvas || !device || !context || !pipeline || !bindGroupLayout || !sampler || !this.isVisible()) {
			return false;
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
				return this.frameGate.reveal(canvas, framePresentationGeneration);
			}
			return false;
		}
		return true;
	}

	resetFrame(): void {
		if (this.canvas) {
			this.frameGate.hide(this.canvas);
		}
	}

	showStartupState(state: JScene3DViewportStartupState, viewportKind: 'scene' | 'game'): void {
		if (!this.errorElement || !this.messageElement || !this.spinnerElement) {
			return;
		}
		const presentation = jscene3dViewportStartupPresentation(viewportKind, state);
		if (presentation === 'failed') {
			return;
		}
		if (presentation === 'hidden') {
			this.hideFailure();
			return;
		}
		this.messageElement.textContent = presentation === 'scene-loading'
			? localize('jscene3dNativeViewportLoadingScene', "Loading Scene…")
			: presentation === 'renderer-starting'
				? localize('jscene3dNativeViewportStarting', "Starting renderer…")
				: localize('jscene3dNativeViewportWaitingForFrame', "Waiting for first frame…");
		this.spinnerElement.style.display = '';
		this.errorElement.style.color = 'var(--vscode-descriptionForeground)';
		this.errorElement.style.display = 'flex';
		this.errorElement.setAttribute('role', 'status');
	}

	showFailure(detail: string): void {
		if (this.errorElement && this.messageElement && this.spinnerElement) {
			this.spinnerElement.style.display = 'none';
			this.messageElement.textContent = localize('jscene3dNativeViewportFailure', "The native viewport stopped: {0}", detail);
			this.errorElement.style.color = 'var(--vscode-errorForeground)';
			this.errorElement.style.display = 'flex';
			this.errorElement.setAttribute('role', 'alert');
		}
	}

	hideFailure(): void {
		if (this.errorElement && this.messageElement && this.spinnerElement) {
			this.errorElement.style.display = 'none';
			this.messageElement.textContent = '';
			this.spinnerElement.style.display = 'none';
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
