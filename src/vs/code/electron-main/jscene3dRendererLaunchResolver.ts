/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute, join } from '../../base/common/path.js';
import { Promises, SymlinkSupport } from '../../base/node/pfs.js';
import { IJScene3DViewportLaunch } from '../../base/parts/sandbox/common/jscene3dViewport.js';
import { IJScene3DRendererLaunchRequest } from '../node/jscene3dRendererApi.js';

/** Resolves one verified development runtime into an isolated native-renderer launch request. */
export class JScene3DRendererLaunchResolver {
	async resolve(launch: IJScene3DViewportLaunch, width: number, height: number): Promise<IJScene3DRendererLaunchRequest> {
		const javaExecutable = process.env.JSCENE3D_RENDERER_JAVA_EXECUTABLE;
		const runtimeDirectory = process.env.JSCENE3D_RENDERER_RUNTIME_DIRECTORY;
		const contractIdentity = process.env.JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY;
		const buildIdentity = process.env.JSCENE3D_DEVELOPMENT_BUILD_IDENTITY;
		if (!javaExecutable || !isAbsolute(javaExecutable) || !(await this.isFile(javaExecutable))) {
			throw new Error('JSCENE3D_RENDERER_JAVA_EXECUTABLE must identify an absolute Java executable');
		}
		if (!runtimeDirectory || !isAbsolute(runtimeDirectory) || !(await this.isDirectory(runtimeDirectory))) {
			throw new Error('JSCENE3D_RENDERER_RUNTIME_DIRECTORY must identify an extracted renderer runtime');
		}
		if (!contractIdentity || contractIdentity.trim() !== contractIdentity) {
			throw new Error('JSCENE3D_DEVELOPMENT_CONTRACT_IDENTITY must identify the verified Java contract');
		}
		if (!buildIdentity || buildIdentity.trim() !== buildIdentity) {
			throw new Error('JSCENE3D_DEVELOPMENT_BUILD_IDENTITY must identify the verified Java runtime build');
		}
		const libraryDirectory = join(runtimeDirectory, 'lib');
		const nativeLibraryDirectory = join(runtimeDirectory, 'native');
		if (!(await this.isDirectory(libraryDirectory)) || !(await this.isDirectory(nativeLibraryDirectory))) {
			throw new Error('The JScene3D renderer runtime must contain lib and native directories');
		}
		const classPath = (await Promises.readdir(libraryDirectory))
			.filter(entry => entry.endsWith('.jar'))
			.sort()
			.map(entry => join(libraryDirectory, entry));
		if (classPath.length === 0) {
			throw new Error('The JScene3D renderer runtime contains no library JARs');
		}
		if (launch.kind === 'game') {
			for (const artifact of launch.runtimeArtifacts) {
				if (!isAbsolute(artifact) || !(await this.isFile(artifact))) {
					throw new Error('A prepared JScene3D project runtime artifact is unavailable');
				}
				if (!classPath.includes(artifact)) {
					classPath.push(artifact);
				}
			}
		}
		if (!isAbsolute(launch.projectRoot) || !(await this.isDirectory(launch.projectRoot))) {
			throw new Error('The prepared JScene3D project root is unavailable');
		}
		if (!isAbsolute(launch.publishedContentRoot)) {
			throw new Error('The prepared JScene3D published-content root must be absolute');
		}
		return {
			javaExecutable,
			workingDirectory: runtimeDirectory,
			nativeLibraryDirectory,
			classPath,
			mainClass: 'io.github.glynch.jscene3d.editor.renderer.process.EditorRendererMain',
			rendererArguments: [
				'--protocol-version=1.0',
				`--contract-identity=${contractIdentity}`,
				`--build-identity=${buildIdentity}`,
				...(launch.kind === 'scene' ? ['--scene-view'] : []),
				`--project-root=${launch.projectRoot}`,
				`--published-content-root=${launch.publishedContentRoot}`,
				`--engine-version=${launch.engineVersion}`,
				`--project-id=${launch.projectId}`,
				`--scene-asset-id=${launch.sceneAssetId}`
			],
			width,
			height
		};
	}

	private async isFile(path: string): Promise<boolean> {
		try {
			return (await SymlinkSupport.stat(path)).stat.isFile();
		} catch {
			return false;
		}
	}

	private async isDirectory(path: string): Promise<boolean> {
		try {
			return (await SymlinkSupport.stat(path)).stat.isDirectory();
		} catch {
			return false;
		}
	}
}
