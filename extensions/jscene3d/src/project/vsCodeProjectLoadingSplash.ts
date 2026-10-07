/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectLocation, localProjectPath } from './projectLocation';
import {
	ProjectLoadingMetadata,
	ProjectLoadingMetadataSource,
	ProjectLoadingSplashHost,
	ProjectLoadingSplashScheduler,
	projectLoadingMetadata
} from './projectLoadingSplash';

export const showProjectLoadingSplashWorkbenchCommandId = 'jscene3d.workbench.showProjectLoadingSplash';
export const hideProjectLoadingSplashWorkbenchCommandId = 'jscene3d.workbench.hideProjectLoadingSplash';

/** Reads the small presentation-only identity subset from a selected local descriptor. */
export class VsCodeProjectLoadingMetadataSource implements ProjectLoadingMetadataSource {
	async read(location: ProjectLocation): Promise<ProjectLoadingMetadata> {
		const descriptorPath = localProjectPath(location);
		const descriptorUri = vscode.Uri.file(descriptorPath);
		const bytes = await vscode.workspace.fs.readFile(descriptorUri);
		const descriptor = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		const iconUri = await this.iconUri(descriptor, descriptorPath);
		return projectLoadingMetadata(descriptor, candidateName(descriptorPath), iconUri);
	}

	private async iconUri(descriptor: unknown, descriptorPath: string): Promise<string | undefined> {
		const icon = projectIcon(descriptor);
		if (icon === undefined) {
			return undefined;
		}
		const projectRoot = path.dirname(descriptorPath);
		const resolvedIcon = path.resolve(projectRoot, icon);
		const relativeIcon = path.relative(projectRoot, resolvedIcon);
		if (relativeIcon.startsWith(`..${path.sep}`) || relativeIcon === '..' || path.isAbsolute(relativeIcon)) {
			return undefined;
		}
		try {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.file(resolvedIcon));
			return stat.type === vscode.FileType.File ? vscode.Uri.file(resolvedIcon).toString(true) : undefined;
		} catch {
			return undefined;
		}
	}
}

/** Delegates the Project-loading overlay to the product workbench surface. */
export class VsCodeProjectLoadingSplashHost implements ProjectLoadingSplashHost {
	async show(operationId: number, metadata: ProjectLoadingMetadata): Promise<void> {
		await vscode.commands.executeCommand(showProjectLoadingSplashWorkbenchCommandId, operationId, metadata);
	}

	async hide(operationId: number, fadeDurationMs: number): Promise<void> {
		await vscode.commands.executeCommand(
			hideProjectLoadingSplashWorkbenchCommandId,
			operationId,
			fadeDurationMs
		);
	}
}

/** Real presentation clock; tests inject a deterministic scheduler instead. */
export class VsCodeProjectLoadingSplashScheduler implements ProjectLoadingSplashScheduler {
	now(): number {
		return performance.now();
	}

	schedule(callback: () => void, delayMs: number): vscode.Disposable {
		const handle = setTimeout(callback, delayMs);
		return new vscode.Disposable(() => clearTimeout(handle));
	}
}

function projectIcon(descriptor: unknown): string | undefined {
	if (!isRecord(descriptor) || !isRecord(descriptor.identity)) {
		return undefined;
	}
	const icon = descriptor.identity.icon;
	return typeof icon === 'string' && icon.trim().length > 0 ? icon.trim() : undefined;
}

function candidateName(descriptorPath: string): string {
	const name = path.basename(descriptorPath);
	return name.toLowerCase().endsWith('.j3d') ? name.slice(0, -4) : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
