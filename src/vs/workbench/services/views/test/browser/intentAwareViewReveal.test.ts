/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IView, IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { EditorPartMaximizedEditorGroupContext, InEditorZenModeContext } from '../../../../common/contextkeys.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { IWorkbenchLayoutService, PartVisibilityIntent, Parts, ViewHostingPart } from '../../../layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../panecomposite/browser/panecomposite.js';
import { IntentAwareViewReveal } from '../../browser/intentAwareViewReveal.js';
import { ViewRevealDenialReason, ViewRevealIntent, ViewRevealOutcome } from '../../common/viewsService.js';

const VIEW_ID = 'test.view';

class TestViewContainerModel extends mock<IViewContainerModel>() {

	private visible = true;

	override readonly activeViewDescriptors: readonly IViewDescriptor[] = [upcastPartial<IViewDescriptor>({ id: VIEW_ID })];

	override isVisible(_id: string): boolean {
		return this.visible;
	}

	override setVisible(_id: string, visible: boolean): void {
		this.visible = visible;
	}
}

class TestViewDescriptorService extends mock<IViewDescriptorService>() {

	readonly sidebarContainer = upcastPartial<ViewContainer>({ id: 'sidebar.container' });
	readonly auxiliaryContainer = upcastPartial<ViewContainer>({ id: 'auxiliary.container' });
	readonly models = new Map<ViewContainer, TestViewContainerModel>([
		[this.sidebarContainer, new TestViewContainerModel()],
		[this.auxiliaryContainer, new TestViewContainerModel()]
	]);
	container: ViewContainer | null = this.auxiliaryContainer;
	location = ViewContainerLocation.AuxiliaryBar;

	override getViewContainerByViewId(_id: string): ViewContainer | null {
		return this.container;
	}

	override getViewContainerLocation(container: ViewContainer): ViewContainerLocation | null {
		return container === this.container ? this.location : null;
	}

	override getViewContainerModel(container: ViewContainer): IViewContainerModel {
		return this.models.get(container)!;
	}

	moveToSidebar(): void {
		this.container = this.sidebarContainer;
		this.location = ViewContainerLocation.Sidebar;
	}
}

class TestPaneCompositePartService extends mock<IPaneCompositePartService>() {

	override getPartId(location: ViewContainerLocation): Parts.SIDEBAR_PART | Parts.PANEL_PART | Parts.AUXILIARYBAR_PART {
		switch (location) {
			case ViewContainerLocation.Sidebar:
				return Parts.SIDEBAR_PART;
			case ViewContainerLocation.Panel:
				return Parts.PANEL_PART;
			case ViewContainerLocation.AuxiliaryBar:
				return Parts.AUXILIARYBAR_PART;
		}
	}
}

class TestRevealLayoutService {

	readonly intents = new Map<ViewHostingPart, PartVisibilityIntent>();
	readonly visibleParts = new Set<Parts>();
	panelMaximized = false;
	auxiliaryBarMaximized = false;

	getPartVisibilityIntent(part: ViewHostingPart): PartVisibilityIntent {
		return this.intents.get(part) ?? PartVisibilityIntent.Default;
	}

	setPartHiddenByUser(hidden: boolean, part: ViewHostingPart): void {
		this.intents.set(part, hidden ? PartVisibilityIntent.ExplicitlyHidden : PartVisibilityIntent.ExplicitlyShown);
		this.setPartHidden(hidden, part);
	}

	setPartHidden(hidden: boolean, part: Parts): void {
		if (hidden) {
			this.visibleParts.delete(part);
		} else {
			this.visibleParts.add(part);
		}
	}

	isVisible(part: Parts, _targetWindow?: Window): boolean {
		return this.visibleParts.has(part);
	}

	isPanelMaximized(): boolean {
		return this.panelMaximized;
	}

	isAuxiliaryBarMaximized(): boolean {
		return this.auxiliaryBarMaximized;
	}
}

suite('IntentAwareViewReveal', () => {
	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let descriptors: TestViewDescriptorService;
	let layout: TestRevealLayoutService;
	let contextKeys: MockContextKeyService;
	let lifecycle: TestLifecycleService;
	let activeView: IView | null;
	let openCalls: Array<{ id: string; focus: boolean | undefined }>;
	let focusCalls: number;
	let openView: (id: string, focus?: boolean) => Promise<IView | null>;
	let reveal: IntentAwareViewReveal;

	setup(() => {
		descriptors = new TestViewDescriptorService();
		layout = new TestRevealLayoutService();
		contextKeys = new MockContextKeyService();
		InEditorZenModeContext.bindTo(contextKeys);
		lifecycle = disposableStore.add(new TestLifecycleService());
		focusCalls = 0;
		activeView = upcastPartial<IView>({
			id: VIEW_ID,
			isBodyVisible: () => layout.isVisible(partForCurrentLocation()) && descriptors.models.get(descriptors.container!)!.isVisible(VIEW_ID),
			focus: () => focusCalls++
		});
		openCalls = [];
		openView = async (id, focus) => {
			openCalls.push({ id, focus });
			layout.setPartHidden(false, partForCurrentLocation());
			descriptors.models.get(descriptors.container!)!.setVisible(id, true);
			return activeView;
		};
		reveal = disposableStore.add(createReveal());
	});

	function partForCurrentLocation(): ViewHostingPart {
		return new TestPaneCompositePartService().getPartId(descriptors.location);
	}

	function createReveal(): IntentAwareViewReveal {
		return new IntentAwareViewReveal(
			descriptors,
			new TestPaneCompositePartService(),
			upcastPartial<IWorkbenchLayoutService>(layout),
			contextKeys,
			lifecycle,
			(id, focus) => openView(id, focus),
			() => activeView
		);
	}

	test('automatic reveal follows part intent without mutating it', async () => {
		for (const intent of [PartVisibilityIntent.Default, PartVisibilityIntent.ExplicitlyShown]) {
			layout.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			layout.intents.set(Parts.AUXILIARYBAR_PART, intent);
			const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
			assert.deepStrictEqual({ outcome: result.outcome, intent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART) }, {
				outcome: ViewRevealOutcome.Revealed,
				intent
			});
		}

		layout.intents.set(Parts.AUXILIARYBAR_PART, PartVisibilityIntent.ExplicitlyHidden);
		const denied = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		assert.deepStrictEqual(denied, {
			outcome: ViewRevealOutcome.Denied,
			reason: ViewRevealDenialReason.PartExplicitlyHidden
		});
	});

	test('actual hidden state alone permits automatic reveal', async () => {
		layout.setPartHidden(true, Parts.AUXILIARYBAR_PART);

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });

		assert.deepStrictEqual({ outcome: result.outcome, intent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART) }, {
			outcome: ViewRevealOutcome.Revealed,
			intent: PartVisibilityIntent.Default
		});
	});

	test('individually hidden view denies automatic reveal', async () => {
		descriptors.models.get(descriptors.auxiliaryContainer)!.setVisible(VIEW_ID, false);

		assert.deepStrictEqual(await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic }), {
			outcome: ViewRevealOutcome.Denied,
			reason: ViewRevealDenialReason.ViewHidden
		});
		assert.strictEqual(openCalls.length, 0);
	});

	test('already visible view is not reopened and focuses only when requested', async () => {
		activeView = upcastPartial<IView>({ id: VIEW_ID, isBodyVisible: () => true, focus: () => focusCalls++ });

		const withoutFocus = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		const withFocus = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic, focus: true });

		assert.deepStrictEqual({ outcomes: [withoutFocus.outcome, withFocus.outcome], openCalls: openCalls.length, focusCalls }, {
			outcomes: [ViewRevealOutcome.AlreadyVisible, ViewRevealOutcome.AlreadyVisible],
			openCalls: 0,
			focusCalls: 1
		});
	});

	test('successful explicit reveal restores the view and records shown intent', async () => {
		layout.setPartHiddenByUser(true, Parts.AUXILIARYBAR_PART);
		descriptors.models.get(descriptors.auxiliaryContainer)!.setVisible(VIEW_ID, false);

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Explicit, focus: true });

		assert.deepStrictEqual({
			outcome: result.outcome,
			intent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART),
			visible: descriptors.models.get(descriptors.auxiliaryContainer)!.isVisible(VIEW_ID),
			focus: openCalls[0]?.focus
		}, {
			outcome: ViewRevealOutcome.Revealed,
			intent: PartVisibilityIntent.ExplicitlyShown,
			visible: true,
			focus: true
		});
	});

	test('failed explicit reveal restores view and part state without changing intent', async () => {
		layout.setPartHiddenByUser(true, Parts.AUXILIARYBAR_PART);
		descriptors.models.get(descriptors.auxiliaryContainer)!.setVisible(VIEW_ID, false);
		openView = async id => {
			descriptors.models.get(descriptors.auxiliaryContainer)!.setVisible(id, true);
			layout.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			return null;
		};
		reveal.dispose();
		reveal = disposableStore.add(createReveal());

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Explicit });

		assert.deepStrictEqual({
			outcome: result.outcome,
			intent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART),
			viewVisible: descriptors.models.get(descriptors.auxiliaryContainer)!.isVisible(VIEW_ID),
			partVisible: layout.isVisible(Parts.AUXILIARYBAR_PART)
		}, {
			outcome: ViewRevealOutcome.Failed,
			intent: PartVisibilityIntent.ExplicitlyHidden,
			viewVisible: false,
			partVisible: false
		});
	});

	test('current container and part determine policy', async () => {
		layout.intents.set(Parts.AUXILIARYBAR_PART, PartVisibilityIntent.ExplicitlyHidden);
		descriptors.moveToSidebar();

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });

		assert.deepStrictEqual({ outcome: result.outcome, openedPart: partForCurrentLocation() }, {
			outcome: ViewRevealOutcome.Revealed,
			openedPart: Parts.SIDEBAR_PART
		});
	});

	test('explicit reveal opens the current location and ignores the former part intent', async () => {
		layout.intents.set(Parts.AUXILIARYBAR_PART, PartVisibilityIntent.ExplicitlyHidden);
		descriptors.moveToSidebar();

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Explicit });

		assert.deepStrictEqual({
			outcome: result.outcome,
			sidebarIntent: layout.getPartVisibilityIntent(Parts.SIDEBAR_PART),
			auxiliaryIntent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART)
		}, {
			outcome: ViewRevealOutcome.Revealed,
			sidebarIntent: PartVisibilityIntent.ExplicitlyShown,
			auxiliaryIntent: PartVisibilityIntent.ExplicitlyHidden
		});
	});

	test('temporary layout modes deny automatic reveal without changing intent', async () => {
		const zen = InEditorZenModeContext.bindTo(contextKeys);
		zen.set(true);
		const zenResult = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		zen.set(false);
		const editorMaximized = EditorPartMaximizedEditorGroupContext.bindTo(contextKeys);
		editorMaximized.set(true);
		const editorMaximizedResult = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		editorMaximized.set(false);
		layout.panelMaximized = true;
		const panelMaximizedResult = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });

		assert.deepStrictEqual({ zenResult, editorMaximizedResult, panelMaximizedResult, intent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART) }, {
			zenResult: { outcome: ViewRevealOutcome.Denied, reason: ViewRevealDenialReason.TemporaryLayout },
			editorMaximizedResult: { outcome: ViewRevealOutcome.Denied, reason: ViewRevealDenialReason.TemporaryLayout },
			panelMaximizedResult: { outcome: ViewRevealOutcome.Denied, reason: ViewRevealDenialReason.TemporaryLayout },
			intent: PartVisibilityIntent.Default
		});
	});

	test('explicit reveal uses existing behavior during temporary modes', async () => {
		InEditorZenModeContext.bindTo(contextKeys).set(true);

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Explicit });

		assert.strictEqual(result.outcome, ViewRevealOutcome.Revealed);
	});

	test('already visible explicit reveal records shown intent and preserves focus', async () => {
		layout.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		layout.intents.set(Parts.AUXILIARYBAR_PART, PartVisibilityIntent.ExplicitlyHidden);

		const result = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Explicit, focus: true });

		assert.deepStrictEqual({ outcome: result.outcome, intent: layout.getPartVisibilityIntent(Parts.AUXILIARYBAR_PART), focusCalls, openCalls: openCalls.length }, {
			outcome: ViewRevealOutcome.AlreadyVisible,
			intent: PartVisibilityIntent.ExplicitlyShown,
			focusCalls: 1,
			openCalls: 0
		});
	});

	test('new explicit hide wins over pending automatic reveal', async () => {
		const pending = new DeferredPromise<IView | null>();
		openView = async () => pending.p;
		reveal.dispose();
		reveal = disposableStore.add(createReveal());
		const result = reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		layout.setPartHiddenByUser(true, Parts.AUXILIARYBAR_PART);
		pending.complete(activeView);

		assert.deepStrictEqual({ result: await result, partVisible: layout.isVisible(Parts.AUXILIARYBAR_PART) }, {
			result: { outcome: ViewRevealOutcome.Cancelled },
			partVisible: false
		});
	});

	test('new explicit hide wins when the view also moves during automatic reveal', async () => {
		layout.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		activeView = upcastPartial<IView>({ id: VIEW_ID, isBodyVisible: () => false, focus: () => focusCalls++ });
		const pending = new DeferredPromise<IView | null>();
		openView = async () => {
			const view = await pending.p;
			layout.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			return view;
		};
		reveal.dispose();
		reveal = disposableStore.add(createReveal());
		const result = reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		layout.setPartHiddenByUser(true, Parts.AUXILIARYBAR_PART);
		descriptors.moveToSidebar();
		pending.complete(activeView);

		assert.deepStrictEqual({ result: await result, formerPartVisible: layout.isVisible(Parts.AUXILIARYBAR_PART) }, {
			result: { outcome: ViewRevealOutcome.Cancelled },
			formerPartVisible: false
		});
	});

	test('concurrent automatic requests share one open operation and requested focus', async () => {
		const pending = new DeferredPromise<IView | null>();
		openView = async (id, focus) => {
			openCalls.push({ id, focus });
			const view = await pending.p;
			layout.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			return view;
		};
		reveal.dispose();
		reveal = disposableStore.add(createReveal());
		const first = reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		const second = reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic, focus: true });
		pending.complete(activeView);

		const results = await Promise.all([first, second]);
		assert.deepStrictEqual({ outcomes: results.map(result => result.outcome), openCalls, focusCalls }, {
			outcomes: [ViewRevealOutcome.Revealed, ViewRevealOutcome.Revealed],
			openCalls: [{ id: VIEW_ID, focus: false }],
			focusCalls: 1
		});
	});

	test('removed view, moved container, shutdown, and disposal cancel pending automatic reveal', async () => {
		for (const interrupt of ['removed', 'moved', 'shutdown', 'disposed'] as const) {
			const pending = new DeferredPromise<IView | null>();
			openView = async () => pending.p;
			reveal.dispose();
			reveal = disposableStore.add(createReveal());
			const result = reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
			if (interrupt === 'removed') {
				descriptors.container = null;
			} else if (interrupt === 'moved') {
				descriptors.moveToSidebar();
			} else if (interrupt === 'shutdown') {
				lifecycle.willShutdown = true;
			} else {
				reveal.dispose();
			}
			pending.complete(activeView);
			assert.strictEqual((await result).outcome, ViewRevealOutcome.Cancelled, interrupt);
			descriptors = new TestViewDescriptorService();
			lifecycle.dispose();
			lifecycle = disposableStore.add(new TestLifecycleService());
		}
	});

	test('unavailable view is reported without opening', async () => {
		descriptors.container = null;

		assert.deepStrictEqual(await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic }), {
			outcome: ViewRevealOutcome.Unavailable
		});
		assert.strictEqual(openCalls.length, 0);
	});

	test('opening failure and pre-existing shutdown return outcomes without rejection', async () => {
		openView = async () => { throw new Error('open failed'); };
		reveal.dispose();
		reveal = disposableStore.add(createReveal());
		const failed = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });
		lifecycle.willShutdown = true;
		const stopped = await reveal.reveal(VIEW_ID, { intent: ViewRevealIntent.Automatic });

		assert.deepStrictEqual({ failed, stopped }, {
			failed: { outcome: ViewRevealOutcome.Failed },
			stopped: { outcome: ViewRevealOutcome.Cancelled }
		});
	});
});
