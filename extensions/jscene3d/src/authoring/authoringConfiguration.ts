/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { AuthoringLaunchConfiguration } from './authoringService';

/** Resolves the isolated authoring-service launch configuration from environment and settings. */
export function authoringLaunchConfiguration(): AuthoringLaunchConfiguration {
	const configuration = vscode.workspace.getConfiguration('jscene3d.authoring');
	return {
		javaExecutable: process.env.JSCENE3D_JAVA_EXECUTABLE?.trim()
			|| configuration.get<string>('javaExecutable', 'java'),
		modulePath: process.env.JSCENE3D_AUTHORING_SERVICE_MODULE_PATH?.trim()
			|| configuration.get<string>('modulePath', ''),
		installedExtensionMetadata: installedExtensionMetadata(configuration),
		runtimeArtifacts: configuredPathList(
			process.env.JSCENE3D_PROJECT_RUNTIME_ARTIFACT_PATH,
			configuration.get<readonly string[]>('runtimeArtifacts', [])),
		clientLanguage: vscode.env.language
	};
}

/** Resolves ordered descriptor-only extension artifacts independently of the JPMS module path. */
function installedExtensionMetadata(configuration: vscode.WorkspaceConfiguration): readonly string[] {
	const environmentPath = process.env.JSCENE3D_AUTHORING_EXTENSION_METADATA_PATH;
	return configuredPathList(environmentPath, configuration.get<readonly string[]>('installedExtensionMetadata', []));
}

function configuredPathList(environmentPath: string | undefined, fallback: readonly string[]): readonly string[] {
	return environmentPath === undefined ? fallback : environmentPath.length === 0 ? [] : environmentPath.split(path.delimiter);
}
