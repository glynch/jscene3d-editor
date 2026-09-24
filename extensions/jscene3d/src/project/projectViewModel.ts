/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ProjectSnapshot } from './projectState';

/** VS Code-independent node displayed in the existing Project view. */
export interface ProjectTreeNode {
	readonly label: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly children?: readonly ProjectTreeNode[];
}

/** Localized labels used to construct the Project view model. */
export interface ProjectViewLabels {
	readonly opening: string;
	readonly closing: string;
	readonly unavailable: string;
	readonly openFailed: string;
	readonly noProject: string;
	readonly name: string;
	readonly id: string;
	readonly version: string;
	readonly descriptor: string;
	readonly projectRoot: string;
	readonly startupWorld: string;
	readonly authoredAssets: string;
	readonly projectedAssets: string;
}

/** Projects the authoritative project snapshot into the minimal Stage 1 tree. */
export function projectTree(snapshot: ProjectSnapshot, labels: ProjectViewLabels): readonly ProjectTreeNode[] {
	if (snapshot.status === 'opening') {
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
			{ label: labels.name, description: project.name },
			{ label: labels.id, description: project.id },
			{ label: labels.version, description: project.version },
			{ label: labels.descriptor, description: path.basename(project.descriptor), tooltip: project.descriptor },
			{ label: labels.projectRoot, description: project.root, tooltip: project.root },
			{ label: labels.startupWorld, description: `${project.startupWorld.name} (${project.startupWorld.id})` },
			{ label: labels.authoredAssets, description: String(project.assetCounts.authored) },
			{ label: labels.projectedAssets, description: String(project.assetCounts.projected) }
		]
	}];
}
