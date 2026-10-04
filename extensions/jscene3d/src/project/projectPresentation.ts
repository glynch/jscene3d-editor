/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectSnapshot } from './projectState';

/** Stable central presentation derived from the authoritative Project lifecycle. */
export type ProjectPresentation =
	| { readonly status: 'welcome' }
	| { readonly status: 'loading'; readonly projectName: string; readonly phase: 'opening' | 'closing' }
	| {
		readonly status: 'ready';
		readonly projectName: string;
		readonly sceneCount: number;
		readonly entityDefinitionCount: number;
	}
	| { readonly status: 'failed'; readonly failure: string };

/** Project presentation operation implemented by the VS Code adapter. */
export interface ProjectPresentationHost {
	show(presentation: ProjectPresentation): Promise<void>;
}

/** Context and definition-generation visibility applied atomically for one Project snapshot. */
export interface ProjectVisibility {
	readonly open: boolean;
	readonly busy: boolean;
	readonly definitionGeneration?: number;
}

/** Keeps the central Project presentation synchronized with ProjectState. */
export class ProjectPresentationLifecycle {
	private lastKey: string | undefined;

	constructor(
		private readonly host: ProjectPresentationHost,
		private readonly logger: { appendLine(message: string): void }
	) { }

	async synchronize(snapshot: ProjectSnapshot): Promise<void> {
		const presentation = projectPresentation(snapshot);
		const key = JSON.stringify(presentation);
		if (key === this.lastKey) {
			return;
		}
		this.lastKey = key;
		try {
			await this.host.show(presentation);
		} catch (error) {
			this.logger.appendLine(`Failed to update JScene3D Project presentation: ${errorMessage(error)}`);
		}
	}
}

/** Projects lifecycle state without allowing stale Project content to leak through transitions. */
export function projectPresentation(snapshot: ProjectSnapshot): ProjectPresentation {
	switch (snapshot.status) {
		case 'closed':
			return { status: 'welcome' };
		case 'opening':
		case 'replacing':
			return { status: 'loading', projectName: candidateName(snapshot.candidatePath), phase: 'opening' };
		case 'preparingWorkspace':
			return { status: 'loading', projectName: snapshot.project.name, phase: 'opening' };
		case 'cancellingOpen':
			return { status: 'loading', projectName: candidateName(snapshot.candidatePath), phase: 'closing' };
		case 'closing':
			return { status: 'loading', projectName: snapshot.project.name, phase: 'closing' };
		case 'open':
			return {
				status: 'ready',
				projectName: snapshot.project.name,
				sceneCount: snapshot.project.catalog.scenes.length,
				entityDefinitionCount: snapshot.project.catalog.entityDefinitions.length
			};
		case 'openFailed':
		case 'serviceUnavailable':
			return { status: 'failed', failure: snapshot.failure };
	}
}

/** Exposes Project-dependent views only after workspace reconciliation has marked the Project ready. */
export function projectVisibility(snapshot: ProjectSnapshot): ProjectVisibility {
	const open = snapshot.status === 'open';
	return {
		open,
		busy: snapshot.status === 'opening'
			|| snapshot.status === 'preparingWorkspace'
			|| snapshot.status === 'cancellingOpen'
			|| snapshot.status === 'replacing'
			|| snapshot.status === 'closing',
		definitionGeneration: open ? snapshot.generation : undefined
	};
}

/** Reveals only a terminal automatic-reopen state while the application startup splash is active. */
export function shouldRevealStartupPresentation(presentation: ProjectPresentation): boolean {
	return presentation.status !== 'loading';
}

/** Creates the script-free central Project lifecycle document. */
export function projectPresentationHtml(
	presentation: Exclude<ProjectPresentation, { readonly status: 'welcome' }>,
	translate: (message: string, ...args: string[]) => string
): string {
	const content = presentation.status === 'loading'
		? loadingContent(presentation, translate)
		: presentation.status === 'ready'
			? readyContent(presentation, translate)
			: failureContent(presentation.failure, translate);
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>${styles}</style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function loadingContent(
	presentation: Extract<ProjectPresentation, { readonly status: 'loading' }>,
	translate: (message: string, ...args: string[]) => string
): string {
	const title = presentation.phase === 'opening'
		? translate('Opening Project…')
		: translate('Closing Project…');
	return `<section class="card loading" role="status" aria-live="polite">
	<div class="mark" aria-hidden="true"></div>
	<h1>${escapeHtml(title)}</h1>
	<p class="project-name">${escapeHtml(presentation.projectName)}</p>
	<div class="progress" aria-label="${escapeHtml(translate('Project operation in progress'))}"><span></span></div>
</section>`;
}

function readyContent(
	presentation: Extract<ProjectPresentation, { readonly status: 'ready' }>,
	translate: (message: string, ...args: string[]) => string
): string {
	return `<section class="card ready" role="status">
	<div class="mark" aria-hidden="true"></div>
	<h1>${escapeHtml(translate('{0} is open', presentation.projectName))}</h1>
	<p>${escapeHtml(translate('No Scene is currently open.'))}</p>
	<p class="detail">${escapeHtml(translate('Open a Scene from the Project view to start editing.'))}</p>
	<div class="counts">
		<span>${escapeHtml(translate('{0} Scenes', String(presentation.sceneCount)))}</span>
		<span>${escapeHtml(translate('{0} Entity Definitions', String(presentation.entityDefinitionCount)))}</span>
	</div>
</section>`;
}

function failureContent(
	failure: string,
	translate: (message: string, ...args: string[]) => string
): string {
	return `<section class="card failed" role="alert">
	<div class="failure-mark" aria-hidden="true">!</div>
	<h1>${escapeHtml(translate('Project could not be opened'))}</h1>
	<p>${escapeHtml(failure)}</p>
	<p class="detail">${escapeHtml(translate('Choose Open Project to try again. See Problems and JScene3D Output for details.'))}</p>
</section>`;
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function candidateName(candidatePath: string): string {
	const name = candidatePath.replaceAll('\\', '/').split('/').pop() ?? candidatePath;
	return name.toLowerCase().endsWith('.j3d') ? name.slice(0, -4) : name;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const styles = `
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; }
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font: var(--vscode-font-size) var(--vscode-font-family); }
main { min-height: 100%; display: grid; place-items: center; padding: 48px 24px; }
.card { width: min(640px, 100%); text-align: center; }
.mark { width: 64px; height: 64px; margin: 0 auto 24px; border: 5px solid var(--vscode-focusBorder); transform: rotate(30deg) skewY(-30deg) scaleY(.86); opacity: .95; }
h1 { margin: 0 0 12px; font-size: clamp(1.7rem, 4vw, 2.5rem); font-weight: 500; }
p { margin: 8px 0; color: var(--vscode-descriptionForeground); font-size: 1.05rem; line-height: 1.5; }
.project-name { color: var(--vscode-foreground); font-size: 1.2rem; }
.detail { margin-top: 24px; }
.progress { height: 6px; margin: 32px auto 0; overflow: hidden; border-radius: 4px; background: var(--vscode-progressBar-background); opacity: .38; }
.progress span { display: block; width: 38%; height: 100%; border-radius: inherit; background: var(--vscode-progressBar-background); animation: progress 1.5s ease-in-out infinite alternate; opacity: 1; }
.counts { display: flex; justify-content: center; gap: 24px; margin-top: 28px; color: var(--vscode-descriptionForeground); }
.failure-mark { width: 56px; height: 56px; display: grid; place-items: center; margin: 0 auto 22px; border: 2px solid var(--vscode-errorForeground); border-radius: 50%; color: var(--vscode-errorForeground); font-size: 2rem; }
@keyframes progress { from { transform: translateX(-15%); } to { transform: translateX(180%); } }
@media (prefers-reduced-motion: reduce) { .progress span { animation: none; width: 62%; } }
`;
