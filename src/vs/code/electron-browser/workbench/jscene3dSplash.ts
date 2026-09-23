/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const splashElementId = 'monaco-parts-splash';
const splashStyleClass = 'jscene3d-startup-splash-styles';
const splashElements = new WeakMap<Window, { readonly splash: HTMLElement; readonly style: HTMLStyleElement }>();

export function showJScene3DSplash(targetWindow: Window): void {
	const document = targetWindow.document;
	const resourceRoot = new URL('./media/jscene3d/', targetWindow.location.href);

	const style = document.createElement('style');
	style.className = `initialShellColors ${splashStyleClass}`;
	style.textContent = `
		body {
			background-color: #0d1118;
			color: #edf0f6;
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
		#${splashElementId}.jscene3d-startup-splash {
			position: fixed;
			inset: 0;
			z-index: 2147483647;
			background-color: #0d1118;
			overflow: hidden;
			pointer-events: none;
			user-select: none;
		}
		.jscene3d-startup-splash-background {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
			object-position: center center;
		}
		.jscene3d-startup-splash-brand {
			position: absolute;
			top: clamp(48px, 7vh, 72px);
			left: clamp(32px, 5vw, 72px);
			display: flex;
			align-items: center;
			gap: 16px;
			color: #edf0f6;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			text-shadow: 0 2px 16px rgb(0 0 0 / 72%);
		}
		.jscene3d-startup-splash-mark {
			width: clamp(44px, 5vw, 64px);
			height: clamp(44px, 5vw, 64px);
			object-fit: contain;
		}
		.jscene3d-startup-splash-title {
			font-size: clamp(24px, 3vw, 36px);
			font-weight: 600;
			line-height: 1.2;
			letter-spacing: -0.02em;
			white-space: nowrap;
		}
	`;

	const splash = document.createElement('div');
	splash.id = splashElementId;
	splash.className = 'jscene3d-startup-splash';
	splash.setAttribute('role', 'img');
	splash.setAttribute('aria-label', 'JScene3D Editor');

	const background = document.createElement('img');
	background.className = 'jscene3d-startup-splash-background';
	background.src = new URL('viewport-emergence-background.png', resourceRoot).href;
	background.alt = '';
	splash.appendChild(background);

	const brand = document.createElement('div');
	brand.className = 'jscene3d-startup-splash-brand';

	const mark = document.createElement('img');
	mark.className = 'jscene3d-startup-splash-mark';
	mark.src = new URL('jscene3d-mark.svg', resourceRoot).href;
	mark.alt = '';
	brand.appendChild(mark);

	const title = document.createElement('div');
	title.className = 'jscene3d-startup-splash-title';
	title.textContent = 'JScene3D Editor';
	brand.appendChild(title);

	splash.appendChild(brand);
	splashElements.set(targetWindow, { splash, style });
	targetWindow.document.head.appendChild(style);
	targetWindow.document.body.appendChild(splash);
}

export function hideJScene3DSplash(targetWindow: Window): void {
	const elements = splashElements.get(targetWindow);
	elements?.splash.remove();
	elements?.style.remove();
	splashElements.delete(targetWindow);
}
