/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** URI fields required to pass a selected local project descriptor to Java. */
export interface ProjectLocation {
	readonly scheme: string;
	readonly fsPath: string;
}

/** Returns the local descriptor path or rejects a location unavailable to the Java child process. */
export function localProjectPath(location: ProjectLocation): string {
	if (location.scheme !== 'file') {
		throw new Error('JScene3D projects must use the local file system');
	}
	return location.fsPath;
}
