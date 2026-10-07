/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectRecentHistoryStore } from './projectRecentHistory';
import {
	ProjectSessionRecord,
	ProjectSessionRecordStore,
	ProjectSessionResource,
	ProjectSessionResources
} from './projectSessionLifecycle';

const sessionRecordKey = 'activeProjectSession';
const legacyReopenIntentKey = 'pendingProjectReopen';
const recentProjectsKey = 'recentProjects';

/** Converts local paths and URIs without reading or mutating the Code OSS workspace. */
export class VsCodeProjectSessionResources implements ProjectSessionResources {
	resourceForLocalPath(path: string): ProjectSessionResource {
		return resource(vscode.Uri.file(path));
	}

	parseLocalResource(value: string): ProjectSessionResource | undefined {
		let uri: vscode.Uri;
		try {
			uri = vscode.Uri.parse(value, true);
		} catch {
			return undefined;
		}
		return uri.scheme === 'file' && uri.fsPath.length > 0 ? resource(uri) : undefined;
	}
}

/** Stores one stable active-Project record independently of Code OSS workspace identity. */
export class ExtensionProjectSessionRecordStore implements ProjectSessionRecordStore {
	constructor(private readonly state: vscode.Memento) { }

	read(): unknown {
		return this.state.get<unknown>(sessionRecordKey)
			?? this.state.get<unknown>(legacyReopenIntentKey);
	}

	async write(value: ProjectSessionRecord | undefined): Promise<void> {
		await Promise.all([
			this.state.update(sessionRecordKey, value),
			this.state.update(legacyReopenIntentKey, undefined)
		]);
	}
}

/** Stores bounded JScene3D Project history independently of Code OSS workspace history. */
export class ExtensionProjectRecentHistoryStore implements ProjectRecentHistoryStore {
	constructor(private readonly state: vscode.Memento) { }

	read(): unknown {
		return this.state.get<unknown>(recentProjectsKey);
	}

	async write(value: unknown): Promise<void> {
		await this.state.update(recentProjectsKey, value);
	}
}

function resource(uri: vscode.Uri): ProjectSessionResource {
	return { uri: uri.toString(), fsPath: uri.fsPath };
}
