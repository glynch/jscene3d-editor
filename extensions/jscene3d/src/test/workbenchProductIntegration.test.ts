/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('JScene3D workbench product integration', () => {
	test('keeps native Scene composites in the custom-editor undo and redo lifecycle', () => {
		const source = fs.readFileSync(
			path.join(__dirname, '..', '..', '..', '..', 'src', 'vs', 'workbench', 'contrib', 'customEditor', 'browser', 'customEditors.ts'),
			'utf8'
		);

		assert.match(source,
			/activeEditor instanceof SideBySideEditorInput && activeEditor\.primary instanceof CustomEditorInput/);
		assert.match(source, /return activeEditor\.primary/);
		assert.match(source, /getNestedCustomEditorInput\(activeEditorPane\?\.input\)/);
	});

	test('uses a persistent Hierarchy document while filtering', () => {
		const source = fs.readFileSync(
			path.resolve(__dirname, '..', '..', 'src', 'hierarchy', 'hierarchyView.ts'),
			'utf8'
		);
		const document = fs.readFileSync(
			path.resolve(__dirname, '..', '..', 'src', 'hierarchy', 'hierarchyViewDocument.ts'),
			'utf8'
		);

		assert.match(document, /jscene3d\.hierarchy\.update/);
		assert.match(source, /this\.document\.update/);
		assert.doesNotMatch(source, /case 'filter':[\s\S]*?this\.render\(\)/);
	});

	test('does not create a Project placeholder editor', () => {
		const feature = fs.readFileSync(
			path.resolve(__dirname, '..', '..', 'src', 'project', 'projectFeature.ts'),
			'utf8'
		);
		const adapter = fs.readFileSync(
			path.resolve(__dirname, '..', '..', 'src', 'project', 'vsCodeProjectWorkbench.ts'),
			'utf8'
		);

		assert.doesNotMatch(feature, /VsCodeProjectPresentation|ProjectPresentationLifecycle|createWebviewPanel/);
		assert.doesNotMatch(adapter, /createWebviewPanel|registerWebviewPanelSerializer/);
	});

	test('uses the always-available Project view as the non-forced initial product layout', () => {
		const product = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'product.json'), 'utf8')) as {
			readonly defaultLayout?: { readonly force?: boolean; readonly views?: readonly { readonly id: string }[] };
		};

		assert.deepStrictEqual(product.defaultLayout, {
			views: [{ id: 'jscene3d.project' }],
			editors: [{
				uri: {
					scheme: 'walkThrough',
					authority: 'vscode_getting_started_page'
				},
				options: {
					override: 'workbench.editors.gettingStartedInput',
					pinned: false
				}
			}]
		});
	});

	test('routes Scene View into its authored Scene editor instead of opening a standalone viewport tab', () => {
		const source = fs.readFileSync(
			path.resolve(__dirname, '..', '..', 'src', 'sceneView', 'vsCodeSceneView.ts'),
			'utf8'
		);

		assert.match(source, /openSceneEditorWorkbenchCommandId, ownerResource, launch/);
		assert.doesNotMatch(source, /openProjectViewportWorkbenchCommandId/);

		const contribution = fs.readFileSync(
			path.resolve(__dirname, '..', '..', '..', '..', 'src', 'vs', 'workbench', 'contrib', 'jscene3d', 'electron-browser', 'jscene3dViewport.contribution.ts'),
			'utf8'
		);
		const sceneCommand = contribution.slice(
			contribution.indexOf('CommandsRegistry.registerCommand(JSCENE3D_OPEN_SCENE_EDITOR_COMMAND_ID'),
			contribution.indexOf('CommandsRegistry.registerCommand(JSCENE3D_UPDATE_SCENE_VIEW_COMMAND_ID')
		);
		assert.match(sceneCommand, /new JScene3DViewportEditorInput\(launch\)/);
		assert.match(sceneCommand, /JScene3DSceneEditorInput/);
		assert.match(sceneCommand, /replaceEditors/);
		assert.doesNotMatch(sceneCommand, /openEditor\(\s*new JScene3DViewportEditorInput/);

		const sceneInput = fs.readFileSync(
			path.resolve(__dirname, '..', '..', '..', '..', 'src', 'vs', 'workbench', 'contrib', 'jscene3d', 'browser', 'jscene3dSceneEditorInput.ts'),
			'utf8'
		);
		assert.match(sceneInput, /get editorId\(\): string \{ return this\.authored\.editorId; \}/);
		assert.match(sceneInput, /get resource\(\): URI \{ return this\.authored\.resource; \}/);

		const tabs = fs.readFileSync(
			path.resolve(__dirname, '..', '..', '..', '..', 'src', 'vs', 'workbench', 'api', 'browser', 'mainThreadEditorTabs.ts'),
			'utf8'
		);
		assert.match(tabs, /editor instanceof JScene3DSceneEditorInput/);
		assert.match(tabs, /viewType: editor\.authored\.viewType/);
	});
});
