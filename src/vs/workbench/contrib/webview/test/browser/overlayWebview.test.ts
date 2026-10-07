/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { OverlayWebview } from '../../browser/overlayWebview.js';
import { IWebviewElement, IWebviewService } from '../../browser/webview.js';

suite('OverlayWebview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function getOuterEdges(element: HTMLElement): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
		return {
			left: element.classList.contains('webview-overlay-outer-left'),
			right: element.classList.contains('webview-overlay-outer-right'),
			top: element.classList.contains('webview-overlay-outer-top'),
			bottom: element.classList.contains('webview-overlay-outer-bottom'),
		};
	}

	test('keeps overlay classes synchronized with the current anchor part', async () => {
		const root = document.createElement('div');
		const firstPart = document.createElement('div');
		firstPart.className = 'part floating-editor-outer-left floating-editor-outer-top';
		const firstAnchor = document.createElement('div');
		firstPart.appendChild(firstAnchor);
		root.appendChild(firstPart);

		const secondPart = document.createElement('div');
		secondPart.className = 'part floating-part-outer-left floating-part-outer-bottom';
		const secondAnchor = document.createElement('div');
		secondPart.appendChild(secondAnchor);
		root.appendChild(secondPart);

		const modalPart = document.createElement('div');
		modalPart.className = 'part modal-editor-part';
		const modalAnchor = document.createElement('div');
		modalPart.appendChild(modalAnchor);
		root.appendChild(modalPart);

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, { getContainer: () => root });
		instantiationService.stub(IWebviewService, {});
		instantiationService.stub(IContextKeyService, {});
		const overlay = store.add(instantiationService.createInstance(OverlayWebview, {
			title: undefined,
			options: {},
			contentOptions: {},
			extension: undefined,
		}));

		overlay.setAnchorElement(firstAnchor);
		const initialEdges = getOuterEdges(overlay.container);

		firstPart.className = 'part floating-editor-outer-right floating-editor-outer-bottom';
		await timeout(0);
		const updatedFirstEdges = getOuterEdges(overlay.container);

		overlay.setAnchorElement(secondAnchor);
		const reanchoredEdges = getOuterEdges(overlay.container);

		firstPart.className = 'part floating-editor-outer-right floating-editor-outer-top';
		await timeout(0);
		const afterOldPartChanged = getOuterEdges(overlay.container);

		secondPart.className = 'part floating-part-outer-right floating-part-outer-top';
		await timeout(0);
		const updatedSecondEdges = getOuterEdges(overlay.container);

		overlay.setAnchorElement(modalAnchor);
		const modalOverlay = {
			outerEdges: getOuterEdges(overlay.container),
			modal: overlay.container.classList.contains('webview-overlay-modal'),
		};

		overlay.setAnchorElement(firstAnchor);

		assert.deepStrictEqual({
			initialEdges,
			updatedFirstEdges,
			reanchoredEdges,
			afterOldPartChanged,
			updatedSecondEdges,
			modalOverlay,
			modalRemovedAfterReanchor: !overlay.container.classList.contains('webview-overlay-modal'),
		}, {
			initialEdges: { left: true, right: false, top: true, bottom: false },
			updatedFirstEdges: { left: false, right: true, top: false, bottom: true },
			reanchoredEdges: { left: true, right: false, top: false, bottom: true },
			afterOldPartChanged: { left: true, right: false, top: false, bottom: true },
			updatedSecondEdges: { left: false, right: true, top: true, bottom: false },
			modalOverlay: {
				outerEdges: { left: false, right: false, top: false, bottom: false },
				modal: true,
			},
			modalRemovedAfterReanchor: true,
		});
	});

	test('preloads one hidden webview document without claiming the overlay', () => {
		const root = document.createElement('div');
		let createCount = 0;
		let mountCount = 0;
		let html = '';
		const element = new class extends mock<IWebviewElement>() {
			override state: string | undefined;
			override initialScrollProgress = 0;
			override isFocused = false;
			override onDidFocus = Event.None;
			override onDidBlur = Event.None;
			override onDidDispose = Event.None;
			override onDidClickLink = Event.None;
			override onDidScroll = Event.None;
			override onDidWheel = Event.None;
			override onDidUpdateState = Event.None;
			override onFatalError = Event.None;
			override onMissingCsp = Event.None;
			override onMessage = Event.None;
			override intrinsicContentSize = observableValue(this, undefined);

			override setHtml(value: string): void {
				html = value;
			}

			override mountTo(_parent: HTMLElement, targetWindow: CodeWindow): void {
				mountCount++;
				assert.strictEqual(targetWindow, mainWindow);
			}

			override dispose(): void { }
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, { getContainer: () => root });
		instantiationService.stub(IWebviewService, new class extends mock<IWebviewService>() {
			override createWebviewElement(): IWebviewElement {
				createCount++;
				return element;
			}
		});
		instantiationService.stub(IContextKeyService, {});
		const overlay = store.add(instantiationService.createInstance(OverlayWebview, {
			title: undefined,
			options: {},
			contentOptions: {},
			extension: undefined,
		}));
		overlay.setHtml('<p>Project ready</p>');

		overlay.preload(mainWindow);
		overlay.preload(mainWindow);

		assert.deepStrictEqual({
			createCount,
			mountCount,
			html,
			visibility: overlay.container.style.visibility,
		}, {
			createCount: 1,
			mountCount: 1,
			html: '<p>Project ready</p>',
			visibility: 'hidden',
		});
	});
});
