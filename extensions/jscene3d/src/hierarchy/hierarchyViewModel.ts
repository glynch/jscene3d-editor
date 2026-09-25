/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeDto, HierarchyOccurrenceDto } from '../protocol/authoringProtocol';

/** VS Code-independent presentation model for one authoritative hierarchy occurrence. */
export interface HierarchyTreeItemModel {
	readonly id: string;
	readonly label: string;
	readonly kind: HierarchyNodeDto['kind'];
	readonly enabled: boolean;
	readonly editable: boolean;
	readonly hasChildren: boolean;
}

/** Projects Java semantic state without reconstructing hierarchy-domain rules. */
export function hierarchyTreeItem(node: HierarchyNodeDto): HierarchyTreeItemModel {
	return {
		id: occurrenceKey(node.occurrence),
		label: node.label.text,
		kind: node.kind,
		enabled: node.enabled,
		editable: node.editable,
		hasChildren: node.children.length > 0
	};
}

/** Serializes semantic occurrence identity for stable TreeItem reconciliation. */
export function occurrenceKey(occurrence: HierarchyOccurrenceDto): string {
	return `${occurrence.definitionAssetId}/${occurrence.entityPath.join('/')}`;
}
