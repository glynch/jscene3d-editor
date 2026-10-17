/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IView, IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { EditorPartMaximizedEditorGroupContext, InEditorZenModeContext } from '../../../common/contextkeys.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService, PartVisibilityIntent, Parts, ViewHostingPart } from '../../layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { IViewRevealOptions, ViewRevealDenialReason, ViewRevealIntent, ViewRevealOutcome, ViewRevealResult } from '../common/viewsService.js';

interface ViewRevealTarget {
	readonly container: ViewContainer;
	readonly location: ViewContainerLocation;
	readonly part: ViewHostingPart;
	readonly model: IViewContainerModel;
}

interface AutomaticRevealFocus {
	focus: boolean;
}

interface PendingAutomaticReveal {
	readonly focusState: AutomaticRevealFocus;
	readonly promise: Promise<ViewRevealResult>;
}

/**
 * Applies intent-aware policy around the established workbench view-opening
 * implementation. This module owns no visibility state of its own.
 */
export class IntentAwareViewReveal extends Disposable {

	private readonly pendingAutomaticReveals = new Map<string, PendingAutomaticReveal>();
	private disposed = false;

	constructor(
		private readonly viewDescriptorService: IViewDescriptorService,
		private readonly paneCompositeService: IPaneCompositePartService,
		private readonly layoutService: IWorkbenchLayoutService,
		private readonly contextKeyService: IContextKeyService,
		private readonly lifecycleService: ILifecycleService,
		private readonly openView: (id: string, focus?: boolean) => Promise<IView | null>,
		private readonly getActiveView: (id: string) => IView | null
	) {
		super();
	}

	/** Reveals a view according to automatic or explicit caller intent. */
	reveal(id: string, options: IViewRevealOptions): Promise<ViewRevealResult> {
		if (options.intent === ViewRevealIntent.Explicit) {
			return this.revealExplicitly(id, options.focus);
		}

		const pending = this.pendingAutomaticReveals.get(id);
		if (pending) {
			pending.focusState.focus ||= options.focus === true;
			return pending.promise;
		}

		const focusState = { focus: options.focus === true };
		const operation: PendingAutomaticReveal = {
			focusState,
			promise: this.revealAutomatically(id, focusState)
		};
		this.pendingAutomaticReveals.set(id, operation);
		void operation.promise.then(() => {
			if (this.pendingAutomaticReveals.get(id) === operation) {
				this.pendingAutomaticReveals.delete(id);
			}
		});
		return operation.promise;
	}

	override dispose(): void {
		this.disposed = true;
		this.pendingAutomaticReveals.clear();
		super.dispose();
	}

	private async revealAutomatically(id: string, focusState: AutomaticRevealFocus): Promise<ViewRevealResult> {
		let targetForRollback: ViewRevealTarget | undefined;
		let wasPartVisible: boolean | undefined;
		try {
			if (this.isStopping()) {
				return { outcome: ViewRevealOutcome.Cancelled };
			}

			const target = this.resolveTarget(id);
			if (!target) {
				return { outcome: ViewRevealOutcome.Unavailable };
			}
			targetForRollback = target;

			const denialReason = this.getAutomaticDenialReason(id, target);
			if (denialReason !== undefined) {
				return { outcome: ViewRevealOutcome.Denied, reason: denialReason };
			}

			const activeView = this.getVisibleActiveView(id);
			if (activeView) {
				if (focusState.focus) {
					activeView.focus();
				}
				return { outcome: ViewRevealOutcome.AlreadyVisible, view: activeView };
			}

			wasPartVisible = this.layoutService.isVisible(target.part);
			const view = await this.openView(id, false);
			if (this.isStopping()) {
				this.restoreAutomaticallyOpenedPart(target, wasPartVisible);
				return { outcome: ViewRevealOutcome.Cancelled };
			}
			if (this.layoutService.getPartVisibilityIntent(target.part) === PartVisibilityIntent.ExplicitlyHidden) {
				this.layoutService.setPartHidden(true, target.part);
				return { outcome: ViewRevealOutcome.Cancelled };
			}

			const currentTarget = this.resolveTarget(id);
			if (!view || !currentTarget) {
				this.restoreAutomaticallyOpenedPart(target, wasPartVisible);
				return view ? { outcome: ViewRevealOutcome.Cancelled } : { outcome: ViewRevealOutcome.Failed };
			}

			if (!this.isSameTarget(target, currentTarget)) {
				this.restoreAutomaticallyOpenedPart(target, wasPartVisible);
				return { outcome: ViewRevealOutcome.Cancelled };
			}

			const currentDenialReason = this.getAutomaticDenialReason(id, currentTarget);
			if (currentDenialReason !== undefined) {
				if (currentDenialReason === ViewRevealDenialReason.PartExplicitlyHidden) {
					this.layoutService.setPartHidden(true, currentTarget.part);
				} else {
					this.restoreAutomaticallyOpenedPart(target, wasPartVisible);
				}
				return { outcome: ViewRevealOutcome.Cancelled };
			}

			if (!view.isBodyVisible()) {
				this.restoreAutomaticallyOpenedPart(target, wasPartVisible);
				return { outcome: ViewRevealOutcome.Failed };
			}

			if (focusState.focus) {
				view.focus();
			}
			return { outcome: ViewRevealOutcome.Revealed, view };
		} catch {
			if (targetForRollback && wasPartVisible !== undefined) {
				this.restoreAutomaticallyOpenedPart(targetForRollback, wasPartVisible);
			}
			return { outcome: ViewRevealOutcome.Failed };
		}
	}

	private async revealExplicitly(id: string, focus: boolean | undefined): Promise<ViewRevealResult> {
		if (this.isStopping()) {
			return { outcome: ViewRevealOutcome.Cancelled };
		}

		const target = this.resolveTarget(id);
		if (!target) {
			return { outcome: ViewRevealOutcome.Unavailable };
		}

		const activeView = this.getVisibleActiveView(id);
		if (activeView) {
			if (focus) {
				activeView.focus();
			}
			this.layoutService.setPartHiddenByUser(false, target.part);
			return { outcome: ViewRevealOutcome.AlreadyVisible, view: activeView };
		}

		const wasPartVisible = this.layoutService.isVisible(target.part);
		const wasViewVisible = target.model.isVisible(id);
		try {
			const view = await this.openView(id, focus);
			if (this.isStopping()) {
				this.rollbackExplicitReveal(id, target, wasPartVisible, wasViewVisible);
				return { outcome: ViewRevealOutcome.Cancelled };
			}

			const currentTarget = this.resolveTarget(id);
			if (!currentTarget || !this.isSameTarget(target, currentTarget)) {
				this.rollbackExplicitReveal(id, target, wasPartVisible, wasViewVisible);
				return { outcome: ViewRevealOutcome.Cancelled };
			}
			if (!view || !view.isBodyVisible()) {
				this.rollbackExplicitReveal(id, target, wasPartVisible, wasViewVisible);
				return { outcome: ViewRevealOutcome.Failed };
			}

			this.layoutService.setPartHiddenByUser(false, currentTarget.part);
			return { outcome: ViewRevealOutcome.Revealed, view };
		} catch {
			this.rollbackExplicitReveal(id, target, wasPartVisible, wasViewVisible);
			return { outcome: ViewRevealOutcome.Failed };
		}
	}

	private resolveTarget(id: string): ViewRevealTarget | undefined {
		const container = this.viewDescriptorService.getViewContainerByViewId(id);
		if (!container) {
			return undefined;
		}

		const location = this.viewDescriptorService.getViewContainerLocation(container);
		if (location === null) {
			return undefined;
		}

		const model = this.viewDescriptorService.getViewContainerModel(container);
		if (!model.activeViewDescriptors.some(descriptor => descriptor.id === id)) {
			return undefined;
		}

		const part = this.paneCompositeService.getPartId(location);
		if (!this.isViewHostingPart(part)) {
			return undefined;
		}

		return { container, location, part, model };
	}

	private getAutomaticDenialReason(id: string, target: ViewRevealTarget): ViewRevealDenialReason | undefined {
		if (this.layoutService.getPartVisibilityIntent(target.part) === PartVisibilityIntent.ExplicitlyHidden) {
			return ViewRevealDenialReason.PartExplicitlyHidden;
		}
		if (!target.model.isVisible(id)) {
			return ViewRevealDenialReason.ViewHidden;
		}
		if (this.isTemporaryLayoutSuppression(target.part)) {
			return ViewRevealDenialReason.TemporaryLayout;
		}
		return undefined;
	}

	private isTemporaryLayoutSuppression(part: ViewHostingPart): boolean {
		if (InEditorZenModeContext.getValue(this.contextKeyService) || EditorPartMaximizedEditorGroupContext.getValue(this.contextKeyService)) {
			return true;
		}
		if (this.layoutService.isPanelMaximized() && part !== Parts.PANEL_PART) {
			return true;
		}
		return this.layoutService.isAuxiliaryBarMaximized() && part !== Parts.AUXILIARYBAR_PART;
	}

	private getVisibleActiveView(id: string): IView | undefined {
		const view = this.getActiveView(id);
		return view?.isBodyVisible() ? view : undefined;
	}

	private rollbackExplicitReveal(id: string, target: ViewRevealTarget, wasPartVisible: boolean, wasViewVisible: boolean): void {
		if (!wasViewVisible && this.isSameTarget(target, this.resolveTarget(id))) {
			target.model.setVisible(id, false);
		}
		if (!wasPartVisible) {
			this.layoutService.setPartHidden(true, target.part);
		}
	}

	private restoreAutomaticallyOpenedPart(target: ViewRevealTarget, wasPartVisible: boolean): void {
		if (!wasPartVisible) {
			this.layoutService.setPartHidden(true, target.part);
		}
	}

	private isSameTarget(first: ViewRevealTarget, second: ViewRevealTarget | undefined): boolean {
		return first.container === second?.container && first.location === second.location && first.part === second.part;
	}

	private isStopping(): boolean {
		return this.disposed || this.lifecycleService.willShutdown;
	}

	private isViewHostingPart(part: Parts): part is ViewHostingPart {
		return part === Parts.SIDEBAR_PART || part === Parts.PANEL_PART || part === Parts.AUXILIARYBAR_PART;
	}
}
