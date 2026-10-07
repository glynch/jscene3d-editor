/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../base/browser/dom.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';

/** Trusted Project identity content supplied by the built-in JScene3D extension. */
export interface JScene3DProjectLoadingSplashData {
	readonly name: string;
	readonly version?: string;
	readonly description?: string;
	readonly authors: readonly string[];
	readonly iconUri?: string;
	readonly artworkUri?: string;
}

interface ProjectLoadingSplashElements {
	readonly operationId: number;
	readonly overlay: HTMLElement;
	readonly style: HTMLStyleElement;
	readonly workbench: HTMLElement | undefined;
	readonly workbenchWasInert: boolean;
	readonly previousFocus: HTMLElement | undefined;
}

const splashElements = new WeakMap<Window, ProjectLoadingSplashElements>();
const overlayClass = 'jscene3d-project-loading-overlay';
const overlayDismissingClass = 'jscene3d-project-loading-overlay-dismissing';

/** Shows one input-blocking Project-loading overlay above the existing workbench. */
export function showJScene3DProjectLoadingSplash(
	targetWindow: Window,
	operationId: number,
	data: JScene3DProjectLoadingSplashData
): void {
	const validated = validateSplashData(operationId, data);
	const existing = splashElements.get(targetWindow);
	if (existing !== undefined && existing.operationId > operationId) {
		return;
	}
	removeSplash(targetWindow, existing, false);

	const document = targetWindow.document;
	const style = document.createElement('style');
	style.className = 'jscene3d-project-loading-styles';
	style.textContent = projectLoadingSplashStyles;
	const overlay = document.createElement('div');
	overlay.className = overlayClass;
	overlay.tabIndex = -1;
	overlay.setAttribute('role', 'status');
	overlay.setAttribute('aria-live', 'polite');
	overlay.setAttribute('aria-label', localize('jscene3d.projectLoading.ariaLabel', "Loading Project {0}", validated.name));

	const card = document.createElement('section');
	card.className = 'jscene3d-project-loading-card';
	card.setAttribute('aria-busy', 'true');
	overlay.appendChild(card);

	const artwork = document.createElement('img');
	artwork.className = 'jscene3d-project-loading-artwork';
	artwork.src = validated.artworkUri === undefined
		? productResource('jscene3d-welcome-hero.png')
		: browserResource(validated.artworkUri);
	artwork.alt = '';
	card.appendChild(artwork);

	const veil = document.createElement('div');
	veil.className = 'jscene3d-project-loading-veil';
	card.appendChild(veil);

	const content = document.createElement('div');
	content.className = 'jscene3d-project-loading-content';
	card.appendChild(content);

	const icon = document.createElement('img');
	icon.className = 'jscene3d-project-loading-icon';
	const fallbackIcon = productResource('jscene3d-project-icon.svg');
	icon.src = validated.iconUri === undefined ? fallbackIcon : browserResource(validated.iconUri);
	icon.alt = '';
	if (validated.iconUri !== undefined) {
		icon.addEventListener('error', () => icon.src = fallbackIcon, { once: true });
	}
	content.appendChild(icon);

	const identity = document.createElement('div');
	identity.className = 'jscene3d-project-loading-identity';
	content.appendChild(identity);
	appendText(document, identity, 'h1', 'jscene3d-project-loading-name', validated.name);
	if (validated.version !== undefined) {
		appendText(document, identity, 'div', 'jscene3d-project-loading-version', validated.version);
	}
	if (validated.description !== undefined) {
		appendText(document, identity, 'p', 'jscene3d-project-loading-description', validated.description);
	}
	const loading = document.createElement('div');
	loading.className = 'jscene3d-project-loading-progress';
	card.appendChild(loading);
	appendText(document, loading, 'div', 'jscene3d-project-loading-label', localize('jscene3d.projectLoading.label', "Loading Project…"));
	const progressTrack = document.createElement('div');
	progressTrack.className = 'jscene3d-project-loading-track';
	progressTrack.setAttribute('aria-hidden', 'true');
	const progressValue = document.createElement('span');
	progressTrack.appendChild(progressValue);
	loading.appendChild(progressTrack);

	const workbench = [...targetWindow.document.body.children]
		.find(element => isHTMLElement(element) && element.classList.contains('monaco-workbench')) as HTMLElement | undefined;
	const activeElement = targetWindow.document.activeElement;
	const previousFocus = isHTMLElement(activeElement) ? activeElement : undefined;
	const workbenchWasInert = workbench?.inert ?? false;
	if (workbench !== undefined) {
		workbench.inert = true;
	}
	targetWindow.document.head.appendChild(style);
	targetWindow.document.body.appendChild(overlay);
	overlay.focus({ preventScroll: true });
	splashElements.set(targetWindow, {
		operationId,
		overlay,
		style,
		workbench,
		workbenchWasInert,
		previousFocus
	});
}

/** Fades and hides only the overlay belonging to the completing Project operation. */
export async function hideJScene3DProjectLoadingSplash(
	targetWindow: Window,
	operationId: number,
	fadeDurationMs: number
): Promise<void> {
	const existing = splashElements.get(targetWindow);
	if (existing?.operationId !== operationId) {
		return;
	}
	const duration = Number.isFinite(fadeDurationMs) && fadeDurationMs > 0 ? fadeDurationMs : 0;
	if (duration > 0 && !prefersReducedMotion(targetWindow)) {
		existing.overlay.style.setProperty('--jscene3d-project-loading-fade-duration', `${duration}ms`);
		existing.overlay.classList.add(overlayDismissingClass);
		await opacityTransition(targetWindow, existing.overlay, duration);
	}
	removeSplash(targetWindow, existing, true);
}

/** Reports whether the Project-loading overlay currently owns workbench interaction. */
export function isJScene3DProjectLoadingSplashVisible(targetWindow: Window): boolean {
	return splashElements.has(targetWindow);
}

function removeSplash(
	targetWindow: Window,
	elements: ProjectLoadingSplashElements | undefined,
	restoreFocus: boolean
): void {
	if (elements === undefined) {
		return;
	}
	elements.overlay.remove();
	elements.style.remove();
	if (splashElements.get(targetWindow) !== elements) {
		return;
	}
	if (elements.workbench !== undefined) {
		elements.workbench.inert = elements.workbenchWasInert;
	}
	if (restoreFocus && elements.previousFocus?.isConnected) {
		elements.previousFocus.focus({ preventScroll: true });
	}
	splashElements.delete(targetWindow);
}

function prefersReducedMotion(targetWindow: Window): boolean {
	return typeof targetWindow.matchMedia === 'function'
		&& targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function opacityTransition(targetWindow: Window, overlay: HTMLElement, durationMs: number): Promise<void> {
	return new Promise(resolve => {
		let complete = false;
		const finish = () => {
			if (complete) {
				return;
			}
			complete = true;
			overlay.removeEventListener('transitionend', acceptTransition);
			targetWindow.clearTimeout(timeout);
			resolve();
		};
		const acceptTransition = (event: TransitionEvent) => {
			if (event.target === overlay && event.propertyName === 'opacity') {
				finish();
			}
		};
		const timeout = targetWindow.setTimeout(finish, durationMs + 50);
		overlay.addEventListener('transitionend', acceptTransition);
	});
}

function validateSplashData(
	operationId: number,
	data: JScene3DProjectLoadingSplashData
): JScene3DProjectLoadingSplashData {
	if (!Number.isSafeInteger(operationId) || operationId <= 0 || !isRecord(data)) {
		throw new Error('Invalid JScene3D Project-loading splash operation');
	}
	const name = optionalText(data.name);
	if (name === undefined || !Array.isArray(data.authors) || !data.authors.every(author => optionalText(author) !== undefined)) {
		throw new Error('Invalid JScene3D Project-loading splash metadata');
	}
	return {
		name,
		version: optionalText(data.version),
		description: optionalText(data.description),
		authors: data.authors.map(author => author.trim()),
		iconUri: optionalResource(data.iconUri),
		artworkUri: optionalResource(data.artworkUri)
	};
}

function optionalText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalResource(value: unknown): string | undefined {
	const text = optionalText(value);
	if (text === undefined) {
		return undefined;
	}
	const resource = URI.parse(text);
	if (resource.scheme !== 'file' && resource.scheme !== 'vscode-file') {
		throw new Error('Invalid JScene3D Project-loading splash resource');
	}
	return text;
}

function browserResource(value: string): string {
	return FileAccess.uriToBrowserUri(URI.parse(value)).toString(true);
}

function productResource(name: string): string {
	return FileAccess.asBrowserUri(`vs/workbench/contrib/jscene3d/browser/media/${name}`).toString(true);
}

function appendText(
	document: Document,
	parent: HTMLElement,
	tagName: 'div' | 'h1' | 'p',
	className: string,
	value: string
): void {
	const element = document.createElement(tagName);
	element.className = className;
	element.textContent = value;
	parent.appendChild(element);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const projectLoadingSplashStyles = `
.${overlayClass} {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: grid;
	place-items: center;
	background: rgb(4 8 15 / 64%);
	backdrop-filter: blur(1px);
	opacity: 1;
	transition: opacity var(--jscene3d-project-loading-fade-duration, 0ms) ease-out;
	user-select: none;
}
.${overlayDismissingClass} { opacity: 0; pointer-events: none; }
.jscene3d-project-loading-card {
	position: relative;
	width: min(640px, calc(100vw - 48px));
	min-height: 330px;
	overflow: hidden;
	border: 1px solid rgb(148 163 184 / 26%);
	border-radius: 12px;
	background: #0b111b;
	box-shadow: 0 20px 64px rgb(0 0 0 / 58%);
	color: #edf2f8;
	font-family: var(--monaco-workbench-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}
.jscene3d-project-loading-artwork,
.jscene3d-project-loading-veil {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}
.jscene3d-project-loading-artwork {
	object-fit: cover;
	object-position: 62% center;
	filter: saturate(72%) brightness(66%);
}
.jscene3d-project-loading-veil {
	background:
		linear-gradient(90deg, rgb(6 10 18 / 96%) 0%, rgb(6 10 18 / 89%) 53%, rgb(6 10 18 / 48%) 100%),
		linear-gradient(0deg, rgb(6 10 18 / 72%) 0%, transparent 48%);
}
.jscene3d-project-loading-content {
	position: relative;
	display: grid;
	grid-template-columns: 76px minmax(0, 1fr);
	gap: 24px;
	min-height: 246px;
	padding: 42px 42px 72px;
}
.jscene3d-project-loading-icon {
	width: 76px;
	height: 76px;
	margin-top: 2px;
	border-radius: 10px;
	object-fit: contain;
	background: rgb(10 16 25 / 78%);
	box-shadow: inset 0 0 0 1px rgb(255 255 255 / 11%), 0 8px 24px rgb(0 0 0 / 26%);
}
.jscene3d-project-loading-identity { min-width: 0; text-shadow: 0 2px 12px rgb(0 0 0 / 72%); }
.jscene3d-project-loading-name {
	margin: 0;
	overflow: hidden;
	font-size: 26px;
	font-weight: 600;
	line-height: 1.2;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.jscene3d-project-loading-version { margin-top: 5px; color: #b9c4d3; font-size: 13px; }
.jscene3d-project-loading-description {
	display: -webkit-box;
	margin: 18px 0 0;
	overflow: hidden;
	color: #d2d9e4;
	font-size: 14px;
	line-height: 1.45;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
}
.jscene3d-project-loading-progress {
	position: absolute;
	right: 42px;
	bottom: 28px;
	left: 42px;
}
.jscene3d-project-loading-label { margin-bottom: 10px; color: #dbe4ef; font-size: 13px; }
.jscene3d-project-loading-track {
	height: 3px;
	overflow: hidden;
	border-radius: 2px;
	background: rgb(148 163 184 / 24%);
}
.jscene3d-project-loading-track span {
	display: block;
	width: 34%;
	height: 100%;
	border-radius: inherit;
	background: #8e77ff;
	animation: jscene3d-project-loading-progress 1.35s ease-in-out infinite;
}
@keyframes jscene3d-project-loading-progress {
	from { transform: translateX(-110%); }
	to { transform: translateX(325%); }
}
@media (max-width: 620px), (max-height: 380px) {
	.jscene3d-project-loading-card { min-height: 272px; }
	.jscene3d-project-loading-content { min-height: 200px; padding: 28px 28px 64px; grid-template-columns: 68px minmax(0, 1fr); gap: 18px; }
	.jscene3d-project-loading-icon { width: 68px; height: 68px; }
	.jscene3d-project-loading-progress { right: 28px; bottom: 20px; left: 28px; }
}
@media (prefers-reduced-motion: reduce) {
	.${overlayClass} { transition: none; }
	.jscene3d-project-loading-track span { width: 62%; animation: none; }
}
`;
