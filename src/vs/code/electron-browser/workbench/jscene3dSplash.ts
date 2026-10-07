/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const splashElementId = 'monaco-parts-splash';
const splashStyleClass = 'jscene3d-startup-splash-styles';
const splashElements = new WeakMap<Window, { readonly splash: HTMLElement; readonly style: HTMLStyleElement }>();

export function showJScene3DSplash(targetWindow: Window, productVersion: string | undefined): void {
	if (productVersion === undefined || productVersion.length === 0) {
		throw new Error('JScene3D Editor product version is unavailable');
	}
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
			top: 0;
			left: 0;
			width: 100%;
			height: 116%;
			object-fit: cover;
			object-position: center top;
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
		.jscene3d-startup-splash-information {
			position: absolute;
			left: clamp(32px, 5vw, 72px);
			bottom: clamp(32px, 6vh, 64px);
			width: min(360px, calc(100vw - 64px));
			padding-left: 18px;
			border-left: 2px solid rgb(142 119 255 / 72%);
			color: #c5cbd6;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			font-size: 13px;
			line-height: 1.55;
			text-shadow: 0 2px 12px rgb(0 0 0 / 80%);
		}
		.jscene3d-startup-splash-product {
			display: flex;
			align-items: baseline;
			gap: 10px;
			color: #edf0f6;
		}
		.jscene3d-startup-splash-product-name {
			font-size: 15px;
			font-weight: 600;
		}
		.jscene3d-startup-splash-version,
		.jscene3d-startup-splash-java,
		.jscene3d-startup-splash-copyright {
			color: #9ba4b3;
		}
		.jscene3d-startup-splash-engine {
			margin-top: 8px;
		}
		.jscene3d-startup-splash-progress-reserve {
			min-height: 18px;
		}
		@media (max-height: 540px) {
			.jscene3d-startup-splash-information { bottom: 24px; }
			.jscene3d-startup-splash-progress-reserve { min-height: 12px; }
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

	const information = document.createElement('div');
	information.className = 'jscene3d-startup-splash-information';

	const productIdentity = document.createElement('div');
	productIdentity.className = 'jscene3d-startup-splash-product';
	const productName = document.createElement('span');
	productName.className = 'jscene3d-startup-splash-product-name';
	productName.textContent = 'JScene3D Editor';
	productIdentity.appendChild(productName);
	const version = document.createElement('span');
	version.className = 'jscene3d-startup-splash-version';
	version.textContent = productVersion;
	productIdentity.appendChild(version);
	information.appendChild(productIdentity);

	const engine = document.createElement('div');
	engine.className = 'jscene3d-startup-splash-engine';
	engine.textContent = 'Powered by JScene3D Engine';
	information.appendChild(engine);
	const java = document.createElement('div');
	java.className = 'jscene3d-startup-splash-java';
	java.textContent = 'Java 21';
	information.appendChild(java);

	const progressReserve = document.createElement('div');
	progressReserve.className = 'jscene3d-startup-splash-progress-reserve';
	progressReserve.setAttribute('aria-hidden', 'true');
	information.appendChild(progressReserve);

	const copyright = document.createElement('div');
	copyright.className = 'jscene3d-startup-splash-copyright';
	copyright.textContent = '© 2026 Graham Lynch';
	information.appendChild(copyright);

	splash.appendChild(information);
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
