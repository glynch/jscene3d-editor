/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorActivation, IEditorOptions, IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorPane, IResourceDiffEditorInput, ITextDiffEditorPane, IUntitledTextResourceEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { TestEditorGroupsService, TestEditorGroupView, TestEditorService } from '../../../../test/browser/workbenchTestServices.js';
import { IOverlayWebview, IWebviewService } from '../../../webview/browser/webview.js';
import { WebviewEditorService } from '../../browser/webviewWorkbenchService.js';

suite('WebviewEditorService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preloads one inactive webview in the target group window', () => {
		const group = new TestEditorGroupView(7);
		const groups = new class extends TestEditorGroupsService {
			constructor() {
				super([group]);
			}

			override registerContextKeyProvider() {
				return { dispose() { } };
			}
		};
		const editorService = store.add(new CapturingEditorService());
		let overlayCount = 0;
		let preloadWindow: CodeWindow | undefined;
		const overlay = new class extends mock<IOverlayWebview>() {
			override preload(targetWindow: CodeWindow): void {
				preloadWindow = targetWindow;
			}
			override dispose(): void { }
		};
		const webviewService = new class extends mock<IWebviewService>() {
			override activeWebview = undefined;
			override onDidChangeActiveWebview = Event.None;
			override createWebviewOverlay(): IOverlayWebview {
				overlayCount++;
				return overlay;
			}
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, groups);
		instantiationService.stub(IEditorService, editorService);
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IWebviewService, webviewService);
		const service = store.add(instantiationService.createInstance(WebviewEditorService));

		const input = store.add(service.openWebview({
			title: 'Project',
			options: {},
			contentOptions: {},
			extension: undefined,
		}, 'project', 'Project', undefined, {
			group,
			initializeInBackground: true,
		}));

		assert.strictEqual(input.webview, overlay);
		assert.deepStrictEqual({
			overlayCount,
			preloadWindow,
			options: editorService.options,
			group: editorService.group,
		}, {
			overlayCount: 1,
			preloadWindow: mainWindow,
			options: {
				pinned: true,
				preserveFocus: true,
				activation: EditorActivation.RESTORE,
			},
			group,
		});
	});
});

class CapturingEditorService extends TestEditorService {
	options: IEditorOptions | undefined;
	group: PreferredGroup | undefined;

	override openEditor(editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: IResourceEditorInput | IUntitledTextResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: IResourceDiffEditorInput, group?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
	override async openEditor(
		_editor: EditorInput | IUntypedEditorInput,
		optionsOrGroup?: IEditorOptions | PreferredGroup,
		group?: PreferredGroup
	): Promise<IEditorPane | undefined> {
		this.options = typeof optionsOrGroup === 'object' ? optionsOrGroup : undefined;
		this.group = group;
		return undefined;
	}
}
