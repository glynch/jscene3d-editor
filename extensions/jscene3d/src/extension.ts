/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { authoringLaunchConfiguration } from './authoring/authoringConfiguration';
import { AuthoringService, NodeAuthoringProcessLauncher } from './authoring/authoringService';
import { registerDefinitionFeature, RegisteredDefinitionFeature } from './definition/definitionFeature';
import { AuthoredDefinitionState } from './definition/authoredDefinitionState';
import { registerHierarchyFeature } from './hierarchy/hierarchyFeature';
import { registerInspectorFeature, RegisteredInspectorFeature } from './inspector/inspectorFeature';
import { registerProjectFeature, RegisteredProjectFeature } from './project/projectFeature';
import { ProjectState } from './project/projectState';
import { registerSceneViewFeature, RegisteredSceneViewFeature } from './sceneView/vsCodeSceneView';
import {
	registerRuntimeViewportFeature,
	RegisteredRuntimeViewportFeature
} from './viewport/runtimeViewportFeature';

interface ActiveExtensionRuntime {
	readonly service: AuthoringService;
	readonly projectState: ProjectState;
	readonly definitionState: AuthoredDefinitionState;
	readonly project: RegisteredProjectFeature;
	readonly definitions: RegisteredDefinitionFeature;
	readonly inspector: RegisteredInspectorFeature;
	readonly hierarchy: vscode.Disposable;
	readonly sceneViews: RegisteredSceneViewFeature;
	readonly runtimeViews: RegisteredRuntimeViewportFeature;
}

let activeRuntime: ActiveExtensionRuntime | undefined;

/** Activates and composes the built-in JScene3D authoring features. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('JScene3D');
	const service = new AuthoringService(authoringLaunchConfiguration, new NodeAuthoringProcessLauncher(), output);
	const projectState = new ProjectState(service, output);
	const definitionState = new AuthoredDefinitionState();
	const sceneViews = registerSceneViewFeature(service, definitionState, output);
	const definitions = registerDefinitionFeature(service, projectState, definitionState, sceneViews, output);
	const inspector = registerInspectorFeature(service, definitionState, definitions, output);
	const hierarchy = registerHierarchyFeature(definitionState, inspector, output);
	const runtimeViews = registerRuntimeViewportFeature(service, projectState, output);
	const projectViewports = {
		closeProjectViewports: async (): Promise<void> => {
			await sceneViews.closeAll();
			await runtimeViews.closeProjectViewports();
		}
	};
	const project = registerProjectFeature(
		context.globalState,
		projectState,
		definitionState,
		definitions,
		inspector,
		projectViewports,
		output
	);
	activeRuntime = {
		service,
		projectState,
		definitionState,
		project,
		definitions,
		inspector,
		hierarchy,
		sceneViews,
		runtimeViews
	};

	context.subscriptions.push(
		output,
		service,
		projectState,
		definitionState,
		project,
		definitions,
		inspector,
		hierarchy,
		sceneViews,
		runtimeViews
	);
	await Promise.all([project.ready, definitions.ready]);
	await project.reopenPendingProject();
	definitions.registerEditorProvider();
}

/** Stops feature callbacks and state before terminating the owned Java service. */
export async function deactivate(): Promise<void> {
	const runtime = activeRuntime;
	activeRuntime = undefined;
	if (runtime === undefined) {
		return;
	}
	runtime.project.dispose();
	runtime.hierarchy.dispose();
	runtime.definitions.dispose();
	runtime.inspector.dispose();
	runtime.sceneViews.dispose();
	runtime.runtimeViews.dispose();
	try {
		await Promise.all([
			runtime.sceneViews.closeAll(),
			runtime.runtimeViews.closeProjectViewports()
		]);
	} finally {
		runtime.projectState.dispose();
		runtime.definitionState.dispose();
		await runtime.service.shutdown();
	}
}
