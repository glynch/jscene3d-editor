/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InspectorSnapshotDto } from '../protocol/authoringProtocol';

export interface InspectorSearchResult {
	readonly kind: 'group' | 'property';
	readonly groupId: string;
	readonly propertyId: string | null;
	readonly label: string;
	readonly groupLabel: string;
}

/** Builds the local, authoritatively ordered presentation index used by the Inspector webview. */
export function inspectorSearchIndex(snapshot: InspectorSnapshotDto): readonly InspectorSearchResult[] {
	const results: InspectorSearchResult[] = [];
	for (const group of snapshot.groups) {
		results.push({ kind: 'group', groupId: group.identity, propertyId: null, label: group.label, groupLabel: group.label });
		for (const property of group.properties) {
			results.push({
				kind: 'property', groupId: group.identity, propertyId: property.identity,
				label: property.label, groupLabel: group.label
			});
		}
	}
	return results;
}

/** Searches component and property labels locally without another authoring-service request. */
export function inspectorSearchResults(snapshot: InspectorSnapshotDto, query: string): readonly InspectorSearchResult[] {
	const needle = query.trim().toLocaleLowerCase();
	return needle.length === 0
		? []
		: inspectorSearchIndex(snapshot).filter(result => result.label.toLocaleLowerCase().includes(needle));
}
