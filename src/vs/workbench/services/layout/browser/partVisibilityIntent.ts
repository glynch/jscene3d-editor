/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { PartVisibilityIntent, Parts, ViewHostingPart } from './layoutService.js';

const STORAGE_KEY = 'workbench.partVisibilityIntent';
const VIEW_HOSTING_PARTS: readonly ViewHostingPart[] = [Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART];

/**
 * Owns persisted user visibility intent for workbench parts that host views.
 *
 * Actual part visibility remains owned by the workbench layout. This state is
 * changed only by verified explicit-user entry points in that layout.
 */
export class WorkbenchPartVisibilityIntentState {

	private readonly intents = new Map<ViewHostingPart, PartVisibilityIntent>();

	constructor(
		private readonly storageService: IStorageService,
		resetLayout: boolean,
	) {
		if (!resetLayout) {
			this.restore();
		}
	}

	/**
	 * Returns the explicit user intent for the part, or the default intent when
	 * no valid persisted choice exists.
	 */
	get(part: ViewHostingPart): PartVisibilityIntent {
		return this.intents.get(part) ?? PartVisibilityIntent.Default;
	}

	/**
	 * Updates the explicit user intent for the part.
	 */
	set(part: ViewHostingPart, intent: PartVisibilityIntent): void {
		if (intent === PartVisibilityIntent.Default) {
			this.intents.delete(part);
		} else {
			this.intents.set(part, intent);
		}
	}

	/**
	 * Persists non-default intent using the normal workspace layout save lifecycle.
	 */
	save(): void {
		if (this.intents.size === 0) {
			this.storageService.remove(STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}

		const stored: Partial<Record<ViewHostingPart, PartVisibilityIntent>> = {};
		for (const part of VIEW_HOSTING_PARTS) {
			const intent = this.intents.get(part);
			if (intent !== undefined) {
				stored[part] = intent;
			}
		}

		this.storageService.store(STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private restore(): void {
		const value = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE);
		if (value === undefined) {
			return;
		}

		try {
			const stored: unknown = JSON.parse(value);
			if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
				return;
			}

			for (const part of VIEW_HOSTING_PARTS) {
				const intent = (stored as Record<string, unknown>)[part];
				if (intent === PartVisibilityIntent.ExplicitlyShown || intent === PartVisibilityIntent.ExplicitlyHidden) {
					this.intents.set(part, intent);
				}
			}
		} catch {
			// Invalid or obsolete state is equivalent to no explicit user choice.
		}
	}
}
