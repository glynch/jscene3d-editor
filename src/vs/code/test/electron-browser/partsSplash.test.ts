/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IPartsSplash } from '../../../platform/theme/common/themeService.js';
import { ThemeTypeSelector } from '../../../platform/theme/common/theme.js';
import { getPartsSplashColors } from '../../electron-browser/workbench/partsSplash.js';
import { hideJScene3DSplash, showJScene3DSplash } from '../../electron-browser/workbench/jscene3dSplash.js';
import { shouldShowJScene3DSplash } from '../../../platform/window/common/window.js';
import product from '../../../platform/product/common/product.js';

suite('Parts splash colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSplash(modernUI: boolean): IPartsSplash {
		return {
			baseTheme: ThemeTypeSelector.VS_DARK,
			zoomLevel: undefined,
			colorInfo: new class extends mock<IPartsSplash['colorInfo']>() {
				override background = '#101010';
				override editorBackground = '#202020';
				override titleBarBackground = '#303030';
				override titleBarInactiveBackground = '#404040';
				override modernUIShellBackground = '#505050';
				override modernUIInactiveShellBackground = '#606060';
				override statusBarBackground = '#707070';
				override statusBarInactiveBackground = '#808080';
				override statusBarNoFolderBackground = '#909090';
			}(),
			layoutInfo: new class extends mock<NonNullable<IPartsSplash['layoutInfo']>>() {
				override modernUI = modernUI;
			}(),
		};
	}

	for (const modernUI of [false, true]) {
		test(`keeps shell and bar colors independent with modern UI ${modernUI}`, () => {
			const splash = createSplash(modernUI);
			assert.deepStrictEqual({
				active: getPartsSplashColors(splash, true, true),
				inactive: getPartsSplashColors(splash, false, true),
				empty: getPartsSplashColors(splash, false, false),
			}, {
				active: {
					background: modernUI ? '#505050' : '#202020',
					titleBarBackground: '#303030',
					statusBarBackground: '#707070',
				},
				inactive: {
					background: modernUI ? '#606060' : '#202020',
					titleBarBackground: '#404040',
					statusBarBackground: '#808080',
				},
				empty: {
					background: modernUI ? '#606060' : '#202020',
					titleBarBackground: '#404040',
					statusBarBackground: '#909090',
				},
			});
		});
	}

	test('supports older splash data without inactive or shell colors', () => {
		const splash = createSplash(true);
		splash.colorInfo.titleBarInactiveBackground = undefined;
		splash.colorInfo.modernUIShellBackground = undefined;
		splash.colorInfo.modernUIInactiveShellBackground = undefined;
		splash.colorInfo.statusBarInactiveBackground = undefined;

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#303030',
			titleBarBackground: '#303030',
			statusBarBackground: '#707070',
		});
	});

	test('retains the active shell when the inactive shell color is absent', () => {
		const splash = createSplash(true);
		splash.colorInfo.modernUIInactiveShellBackground = undefined;

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#505050',
			titleBarBackground: '#404040',
			statusBarBackground: '#808080',
		});
	});

	test('does not treat a transparent customization as a missing color', () => {
		const splash = createSplash(true);
		splash.colorInfo.statusBarInactiveBackground = '#00000000';

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#606060',
			titleBarBackground: '#404040',
			statusBarBackground: '#00000000',
		});
	});
});

suite('JScene3D startup splash', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => hideJScene3DSplash(mainWindow));

	test('composes the owned background, mark, and product name', () => {
		showJScene3DSplash(mainWindow, product.jscene3dVersion);

		const splash = mainWindow.document.getElementById('monaco-parts-splash');
		assert.deepStrictEqual({
			role: splash?.getAttribute('role'),
			label: splash?.getAttribute('aria-label'),
			background: splash?.querySelector<HTMLImageElement>('.jscene3d-startup-splash-background')?.src.endsWith('/media/jscene3d/viewport-emergence-background.png'),
			mark: splash?.querySelector<HTMLImageElement>('.jscene3d-startup-splash-mark')?.src.endsWith('/media/jscene3d/jscene3d-mark.svg'),
			title: splash?.querySelector('.jscene3d-startup-splash-title')?.textContent,
		}, {
			role: 'img',
			label: 'JScene3D Editor',
			background: true,
			mark: true,
			title: 'JScene3D Editor',
		});
	});

	test('uses the product-owned JScene3D version and restrained static product information', () => {
		showJScene3DSplash(mainWindow, product.jscene3dVersion);

		const splash = mainWindow.document.getElementById('monaco-parts-splash');
		const text = splash?.textContent ?? '';
		assert.deepStrictEqual({
			jscene3dVersion: product.jscene3dVersion,
			codeOssVersion: product.version,
			shownVersion: splash?.querySelector('.jscene3d-startup-splash-version')?.textContent,
			engine: splash?.querySelector('.jscene3d-startup-splash-engine')?.textContent,
			java: splash?.querySelector('.jscene3d-startup-splash-java')?.textContent,
			copyright: splash?.querySelector('.jscene3d-startup-splash-copyright')?.textContent,
			futureProgressReserve: splash?.querySelector('.jscene3d-startup-splash-progress-reserve')?.textContent,
			showsCodeOssVersion: text.includes(product.version),
			hasFakeProgress: /Starting|Loading|Ready|\d+%/i.test(text)
		}, {
			jscene3dVersion: '0.1.0',
			codeOssVersion: '1.138.0',
			shownVersion: '0.1.0',
			engine: 'Powered by JScene3D Engine',
			java: 'Java 21',
			copyright: '© 2026 Graham Lynch',
			futureProgressReserve: '',
			showsCodeOssVersion: false,
			hasFakeProgress: false
		});
	});

	test('fills the splash with cropped artwork and overlays metadata without a footer', () => {
		showJScene3DSplash(mainWindow, product.jscene3dVersion);

		const splash = mainWindow.document.getElementById('monaco-parts-splash');
		const style = mainWindow.document.head.querySelector<HTMLStyleElement>('.jscene3d-startup-splash-styles');
		const information = splash?.querySelector('.jscene3d-startup-splash-information');
		assert.deepStrictEqual({
			backgroundIsDirectChild: splash?.firstElementChild?.classList.contains('jscene3d-startup-splash-background'),
			informationIsOverlay: information?.parentElement === splash,
			hasFooter: splash?.querySelector('[class*="footer"]') !== null,
			cropsSourceFooter: style?.textContent?.includes('height: 116%;'),
			anchorsArtworkAtTop: style?.textContent?.includes('object-position: center top;'),
			artworkContainerFillsWindow: style?.textContent?.includes('position: fixed;\n\t\t\tinset: 0;')
		}, {
			backgroundIsDirectChild: true,
			informationIsOverlay: true,
			hasFooter: false,
			cropsSourceFooter: true,
			anchorsArtworkAtTop: true,
			artworkContainerFillsWindow: true
		});
	});

	test('removes the splash and its initial styles on startup failure', () => {
		showJScene3DSplash(mainWindow, product.jscene3dVersion);
		hideJScene3DSplash(mainWindow);

		assert.deepStrictEqual({
			splash: mainWindow.document.getElementById('monaco-parts-splash'),
			styles: mainWindow.document.head.querySelector('.jscene3d-startup-splash-styles'),
		}, {
			splash: null,
			styles: null,
		});
	});

	test('uses the branded splash only for the first editor window during application startup', () => {
		assert.deepStrictEqual({
			initialEditor: shouldShowJScene3DSplash('jscene3d-editor', {
				initialStartup: true, newWindow: true, hasOpenWindows: false, sessionsWindow: false
			}),
			reloadedEditor: shouldShowJScene3DSplash('jscene3d-editor', {
				initialStartup: false, newWindow: false, hasOpenWindows: true, sessionsWindow: false
			}),
			laterEditorWindow: shouldShowJScene3DSplash('jscene3d-editor', {
				initialStartup: true, newWindow: true, hasOpenWindows: true, sessionsWindow: false
			}),
			sessions: shouldShowJScene3DSplash('jscene3d-editor', {
				initialStartup: true, newWindow: true, hasOpenWindows: false, sessionsWindow: true
			}),
			codeOss: shouldShowJScene3DSplash('code-oss', {
				initialStartup: true, newWindow: true, hasOpenWindows: false, sessionsWindow: false
			})
		}, {
			initialEditor: true,
			reloadedEditor: false,
			laterEditorWindow: false,
			sessions: false,
			codeOss: false
		});
	});

});
