/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { IPaneComposite } from '../../../common/panecomposite.js';
import { IView, IViewDescriptor, IViewPaneContainer, ViewContainer, ViewContainerLocation } from '../../../common/views.js';

export const IViewsService = createDecorator<IViewsService>('viewsService');

/** Describes why a caller is asking the workbench to reveal a view. */
export const enum ViewRevealIntent {
	/** A convenience reveal that must respect persisted user visibility choices. */
	Automatic,
	/** A direct user request that may override persisted hidden state. */
	Explicit
}

/** Describes the completed state of an intent-aware view reveal. */
export const enum ViewRevealOutcome {
	/** The operation opened and revealed the view. */
	Revealed,
	/** The view was already visible and did not need to be reopened. */
	AlreadyVisible,
	/** Workbench visibility policy denied the reveal. */
	Denied,
	/** The requested view is not currently available. */
	Unavailable,
	/** Workbench state changed while the reveal was pending. */
	Cancelled,
	/** Existing view-opening infrastructure could not reveal the view. */
	Failed
}

/** Describes the policy rule that denied an automatic reveal. */
export const enum ViewRevealDenialReason {
	/** The user explicitly hid the workbench part containing the view. */
	PartExplicitlyHidden,
	/** The individual view is hidden in its current container. */
	ViewHidden,
	/** Revealing the view would disrupt a temporary workbench layout mode. */
	TemporaryLayout
}

/** Options for an intent-aware view reveal. */
export interface IViewRevealOptions {
	readonly intent: ViewRevealIntent;
	readonly focus?: boolean;
}

/** Result of an intent-aware view reveal. */
export type ViewRevealResult =
	| { readonly outcome: ViewRevealOutcome.Revealed; readonly view: IView }
	| { readonly outcome: ViewRevealOutcome.AlreadyVisible; readonly view: IView }
	| { readonly outcome: ViewRevealOutcome.Denied; readonly reason: ViewRevealDenialReason }
	| { readonly outcome: ViewRevealOutcome.Unavailable }
	| { readonly outcome: ViewRevealOutcome.Cancelled }
	| { readonly outcome: ViewRevealOutcome.Failed };

export interface IViewsService {

	readonly _serviceBrand: undefined;

	// View Container APIs
	readonly onDidChangeViewContainerVisibility: Event<{ id: string; visible: boolean; location: ViewContainerLocation }>;
	isViewContainerVisible(id: string): boolean;
	isViewContainerActive(id: string): boolean;
	openViewContainer(id: string, focus?: boolean): Promise<IPaneComposite | null>;
	closeViewContainer(id: string): void;
	getVisibleViewContainer(location: ViewContainerLocation): ViewContainer | null;
	getActiveViewPaneContainerWithId(viewContainerId: string): IViewPaneContainer | null;
	getFocusedView(): IViewDescriptor | null;
	getFocusedViewName(): string;

	// View APIs
	readonly onDidChangeViewVisibility: Event<{ id: string; visible: boolean }>;
	readonly onDidChangeFocusedView: Event<void>;
	isViewVisible(id: string): boolean;
	openView<T extends IView>(id: string, focus?: boolean): Promise<T | null>;
	/**
	 * Reveals a view according to the supplied caller intent without changing
	 * the established semantics of {@link openView}.
	 */
	revealView(id: string, options: IViewRevealOptions): Promise<ViewRevealResult>;
	closeView(id: string): void;
	getActiveViewWithId<T extends IView>(id: string): T | null;
	getViewWithId<T extends IView>(id: string): T | null;
	getViewProgressIndicator(id: string): IProgressIndicator | undefined;
}
