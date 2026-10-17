/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoredDefinitionState } from '../definition/authoredDefinitionState';

export type InspectorAutomaticRevealAction = () => PromiseLike<void> | void;
export type InspectorRevealFailureHandler = (error: unknown) => void;
export type InspectorVisibility = () => boolean;

/** Requests an intent-aware automatic Inspector reveal when shared selection acquires an entity. */
export class InspectorSelectionReveal {
	private readonly subscription: { dispose(): void };

	constructor(
		definitions: AuthoredDefinitionState,
		isVisible: InspectorVisibility,
		reveal: InspectorAutomaticRevealAction,
		reportFailure: InspectorRevealFailureHandler
	) {
		this.subscription = definitions.onDidChange(change => {
			if (change !== 'selection' || definitions.selection === undefined || isVisible()) {
				return;
			}
			void Promise.resolve(reveal()).catch(reportFailure);
		});
	}

	dispose(): void {
		this.subscription.dispose();
	}
}
