/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoringTextDto } from '../protocol/authoringProtocol';

/** Projection state shown before a Scene has a native viewport. */
export type SceneEditorProjectionState =
	| { readonly kind: 'projection-pending' }
	| { readonly kind: 'failed'; readonly reason: string };

/** Localized text used by the script-free initial Scene presentation. */
export interface SceneEditorPresentationText {
	readonly scene: string;
	readonly loading: string;
}

/** Creates the script-free initial Scene editor presentation. */
export function sceneEditorHtml(
	label: AuthoringTextDto,
	state: SceneEditorProjectionState,
	text: SceneEditorPresentationText
): string {
	const title = escapeHtml(label.text);
	const failed = state.kind === 'failed';
	const content = failed
		? `<main><h1>${title}</h1><p>${escapeHtml(text.scene)}</p><p class="message failure" role="alert">${escapeHtml(state.reason)}</p></main>`
		: `<main class="loading" role="status"><span class="spinner" aria-hidden="true"></span><p class="message">${escapeHtml(text.loading)}</p></main>`;
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}main{text-align:center;padding:24px}h1{font-size:1.4rem;font-weight:500}.loading{display:flex;align-items:center;gap:10px}.spinner{width:16px;height:16px;border:2px solid color-mix(in srgb,var(--vscode-descriptionForeground) 30%,transparent);border-top-color:var(--vscode-descriptionForeground);border-radius:50%;animation:spin 1.5s steps(30) infinite}.message{margin:0;color:var(--vscode-descriptionForeground)}.failure{color:var(--vscode-errorForeground);max-width:48rem}@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spinner{animation:none}}</style></head><body>${content}</body></html>`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		'\'': '&#39;'
	})[character] ?? character);
}
