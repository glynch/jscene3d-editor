/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeDto, HierarchyOccurrenceDto } from '../protocol/authoringProtocol';

export const hierarchyViewId = 'jscene3d.hierarchy';
export const hierarchyFocusCommandId = `${hierarchyViewId}.focus`;

export type HierarchyCommandExecutor = (command: string) => PromiseLike<unknown> | unknown;

/** Reveals the active JScene3D Project by focusing its primary Hierarchy view. */
export async function revealJScene3DProject(executeCommand: HierarchyCommandExecutor): Promise<void> {
	await executeCommand(hierarchyFocusCommandId);
}

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

/** Filters by display name while retaining every ancestor needed to preserve tree context. */
export function filterHierarchyNodes(
	nodes: readonly HierarchyNodeDto[],
	query: string
): readonly HierarchyNodeDto[] {
	const normalized = query.trim().toLocaleLowerCase();
	if (normalized.length === 0) {
		return nodes;
	}
	return nodes.flatMap(node => {
		const children = filterHierarchyNodes(node.children, normalized);
		return node.label.text.toLocaleLowerCase().includes(normalized) || children.length > 0
			? [{ ...node, children }]
			: [];
	});
}
