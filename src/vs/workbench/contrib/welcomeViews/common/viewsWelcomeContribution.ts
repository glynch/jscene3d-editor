/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IExtensionPoint, IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';
import { ViewsWelcomeExtensionPoint, ViewWelcome, ViewIdentifierMap } from './viewsWelcomeExtensionPoint.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewContainerExtensions, IViewContentDescriptor, IViewsRegistry } from '../../../common/views.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

export class ViewsWelcomeContribution extends Disposable implements IWorkbenchContribution {

	private viewWelcomeContents = new Map<ViewWelcome, IDisposable>();

	constructor(
		extensionPoint: IExtensionPoint<ViewsWelcomeExtensionPoint>,
		@IProductService private readonly productService: IProductService
	) {
		super();

		extensionPoint.setHandler((_, { added, removed }) => {
			for (const contribution of removed) {
				for (const welcome of contribution.value) {
					const disposable = this.viewWelcomeContents.get(welcome);

					disposable?.dispose();
				}
			}

			const welcomesByViewId = new Map<string, Map<ViewWelcome, IViewContentDescriptor>>();

			for (const contribution of added) {
				for (const welcome of contribution.value) {
					const productWelcome = adaptJScene3DSourceControlWelcome(welcome, contribution.description.identifier.value, this.productService.applicationName);
					const { group, order } = parseGroupAndOrder(productWelcome, contribution);
					const precondition = ContextKeyExpr.deserialize(productWelcome.enablement);

					const id = ViewIdentifierMap[productWelcome.view] ?? productWelcome.view;
					let viewContentMap = welcomesByViewId.get(id);
					if (!viewContentMap) {
						viewContentMap = new Map();
						welcomesByViewId.set(id, viewContentMap);
					}

					viewContentMap.set(welcome, {
						content: productWelcome.contents,
						when: ContextKeyExpr.deserialize(productWelcome.when),
						precondition,
						group,
						order
					});
				}
			}

			for (const [id, viewContentMap] of welcomesByViewId) {
				const disposables = viewsRegistry.registerViewWelcomeContent2(id, viewContentMap);

				for (const [welcome, disposable] of disposables) {
					this.viewWelcomeContents.set(welcome, disposable);
				}
			}
		});
	}
}

/** Replaces only the built-in Git no-workspace welcome content for the JScene3D product. */
export function adaptJScene3DSourceControlWelcome(welcome: ViewWelcome, extensionId: string, applicationName: string): ViewWelcome {
	if (applicationName !== 'jscene3d-editor'
		|| extensionId !== 'vscode.git'
		|| welcome.view !== 'scm'
		|| !welcome.contents.includes('command:vscode.openFolder')
		|| !welcome.contents.includes('command:git.cloneRecursive')) {
		return welcome;
	}

	return {
		...welcome,
		contents: nls.localize({
			key: 'jscene3d.sourceControl.empty',
			comment: [
				'Please do not translate the command identifiers inside the Markdown links.',
				'{Locked="](command:jscene3d.openProject)"}',
				'{Locked="](command:git.cloneRecursive)"}'
			]
		}, "In order to use Git features, open a JScene3D project containing a Git repository or clone from a URL.\n[Open Project...](command:jscene3d.openProject)\n[Clone Repository](command:git.cloneRecursive)")
	};
}

function parseGroupAndOrder(welcome: ViewWelcome, contribution: IExtensionPointUser<ViewsWelcomeExtensionPoint>): { group: string | undefined; order: number | undefined } {

	let group: string | undefined;
	let order: number | undefined;
	if (welcome.group) {
		if (!isProposedApiEnabled(contribution.description, 'contribViewsWelcome')) {
			contribution.collector.warn(nls.localize('ViewsWelcomeExtensionPoint.proposedAPI', "The viewsWelcome contribution in '{0}' requires 'enabledApiProposals: [\"contribViewsWelcome\"]' in order to use the 'group' proposed property.", contribution.description.identifier.value));
			return { group, order };
		}

		const idx = welcome.group.lastIndexOf('@');
		if (idx > 0) {
			group = welcome.group.substr(0, idx);
			order = Number(welcome.group.substr(idx + 1)) || undefined;
		} else {
			group = welcome.group;
		}
	}
	return { group, order };
}
