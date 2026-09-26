/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultLayout } from './web.api.js';

/** Resolves default views only when the requested layout is eligible for this workspace. */
export function getDefaultLayoutViews(defaultLayout: IDefaultLayout | undefined, isNewWorkspace: boolean): string[] | undefined {
	if (!defaultLayout || !defaultLayout.force && !isNewWorkspace) {
		return undefined;
	}

	const { views } = defaultLayout;
	return views?.length ? views.map(view => view.id) : undefined;
}
