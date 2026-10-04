/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { openDefinitionCommandId } from '../definition/authoredDefinitionOpener';
import { ProjectCatalogEntryDto } from '../protocol/authoringProtocol';
import { ProjectSnapshot } from './projectState';

export const projectViewId = 'jscene3d.project';

/** VS Code-independent node displayed in the existing Project view. */
export interface ProjectTreeNode {
	readonly label: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly children?: readonly ProjectTreeNode[];
	readonly command?: { readonly command: string; readonly title: string; readonly arguments?: unknown[] };
}

/** Localized labels used to construct the Project view model. */
export interface ProjectViewLabels {
	readonly opening: string;
	readonly closing: string;
	readonly unavailable: string;
	readonly openFailed: string;
	readonly noProject: string;
	readonly scenes: string;
	readonly entityDefinitions: string;
	readonly noScenes: string;
	readonly noEntityDefinitions: string;
	readonly mainScene: string;
	readonly generated: string;
	readonly readOnly: string;
}

/** Projects the authoritative project snapshot into the semantic Project tree. */
export function projectTree(snapshot: ProjectSnapshot, labels: ProjectViewLabels): readonly ProjectTreeNode[] {
	if (snapshot.status === 'opening' || snapshot.status === 'preparingWorkspace' || snapshot.status === 'replacing') {
		return [{ label: labels.opening }];
	}
	if (snapshot.status === 'closing' || snapshot.status === 'cancellingOpen') {
		return [{ label: labels.closing }];
	}
	if (snapshot.status === 'openFailed' || snapshot.status === 'serviceUnavailable') {
		return [{ label: labels.unavailable, description: labels.openFailed }];
	}
	if (snapshot.status === 'closed') {
		return [{ label: labels.noProject }];
	}
	const project = snapshot.project;
	return [{
		label: project.name,
		description: project.version,
		children: [
			catalogGroup(labels.scenes, labels.noScenes, project.catalog.scenes, snapshot.generation, labels),
			catalogGroup(
				labels.entityDefinitions,
				labels.noEntityDefinitions,
				project.catalog.entityDefinitions,
				snapshot.generation,
				labels
			)
		]
	}];
}

/** Builds one fixed semantic group, including an explicit empty state. */
function catalogGroup(
	label: string,
	emptyLabel: string,
	entries: readonly ProjectCatalogEntryDto[],
	projectGeneration: number,
	labels: ProjectViewLabels
): ProjectTreeNode {
	return {
		label,
		children: entries.length === 0
			? [{ label: emptyLabel }]
			: entries.map(entry => catalogEntry(entry, projectGeneration, labels))
	};
}

/** Presents Java-owned semantics while retaining stable AssetId and generation for opening. */
function catalogEntry(
	entry: ProjectCatalogEntryDto,
	projectGeneration: number,
	labels: ProjectViewLabels
): ProjectTreeNode {
	const qualifiers = [
		entry.mainScene ? labels.mainScene : undefined,
		entry.origin === 'generated' ? labels.generated : undefined,
		entry.editable ? undefined : labels.readOnly
	].filter((value): value is string => value !== undefined);
	return {
		label: entry.name,
		description: qualifiers.length === 0 ? undefined : qualifiers.join(' · '),
		tooltip: entry.source,
		command: {
			command: openDefinitionCommandId,
			title: entry.name,
			arguments: [entry.id, projectGeneration]
		}
	};
}
