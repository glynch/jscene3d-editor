/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectSnapshot } from './projectState';

/** Workbench operation needed after a Project becomes authoritatively open. */
export interface ProjectWelcomeHost {
	closeWelcome(): Promise<void>;
}

/** Closes Welcome once for each successfully opened Project generation. */
export class ProjectWelcomeLifecycle {
	private closedGeneration: number | undefined;

	constructor(
		private readonly host: ProjectWelcomeHost,
		private readonly logger: { appendLine(message: string): void }
	) { }

	async synchronize(snapshot: ProjectSnapshot): Promise<void> {
		if (snapshot.status !== 'open' || snapshot.generation === this.closedGeneration) {
			return;
		}
		this.closedGeneration = snapshot.generation;
		try {
			await this.host.closeWelcome();
		} catch (error) {
			this.logger.appendLine(`Failed to close JScene3D Welcome: ${errorMessage(error)}`);
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
