/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectSnapshot } from './projectState';

/** Workbench state derived from the authoritative Project lifecycle without creating an editor. */
export type ProjectWorkbenchPresentation =
	| { readonly status: 'welcome' }
	| { readonly status: 'transition' }
	| { readonly status: 'ready'; readonly projectName: string };

/** Project workbench operation implemented by the VS Code adapter. */
export interface ProjectWorkbenchHost {
	show(presentation: ProjectWorkbenchPresentation): Promise<void>;
}

/** Context and definition-generation visibility applied for one Project snapshot. */
export interface ProjectVisibility {
	readonly open: boolean;
	readonly busy: boolean;
	readonly definitionGeneration?: number;
}

/** Keeps Welcome, startup coverage, and the tabless Project empty state synchronized with ProjectState. */
export class ProjectWorkbenchLifecycle {
	private lastKey: string | undefined;
	private pendingUpdate: Promise<void> = Promise.resolve();

	constructor(
		private readonly host: ProjectWorkbenchHost,
		private readonly logger: { appendLine(message: string): void }
	) { }

	synchronize(snapshot: ProjectSnapshot): Promise<void> {
		const presentation = projectWorkbenchPresentation(snapshot);
		const key = JSON.stringify(presentation);
		if (key === this.lastKey) {
			return this.pendingUpdate;
		}
		this.lastKey = key;
		this.pendingUpdate = this.pendingUpdate.then(async () => {
			if (key !== this.lastKey) {
				return;
			}
			try {
				await this.host.show(presentation);
			} catch (error) {
				this.logger.appendLine(`Failed to update JScene3D Project workbench: ${errorMessage(error)}`);
			}
		});
		return this.pendingUpdate;
	}
}

/** Projects lifecycle state without retaining a placeholder Project editor. */
export function projectWorkbenchPresentation(snapshot: ProjectSnapshot): ProjectWorkbenchPresentation {
	switch (snapshot.status) {
		case 'closed':
		case 'openFailed':
		case 'serviceUnavailable':
			return { status: 'welcome' };
		case 'opening':
		case 'cancellingOpen':
		case 'replacing':
		case 'closing':
			return { status: 'transition' };
		case 'open':
			return { status: 'ready', projectName: snapshot.project.name };
	}
}

/** Exposes Project-dependent views only while Java retains the authoritative Project session. */
export function projectVisibility(snapshot: ProjectSnapshot): ProjectVisibility {
	const open = snapshot.status === 'open';
	return {
		open,
		busy: snapshot.status === 'opening'
			|| snapshot.status === 'cancellingOpen'
			|| snapshot.status === 'replacing'
			|| snapshot.status === 'closing',
		definitionGeneration: open ? snapshot.generation : undefined
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
