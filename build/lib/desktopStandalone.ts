/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as path from 'path';

const desktopStandaloneFiles = [
	{ file: 'vs/base/parts/sandbox/electron-browser/preload.ts', bundle: true },
	{ file: 'vs/base/parts/sandbox/electron-browser/preload-aux.ts', bundle: false },
	{ file: 'vs/platform/browserView/electron-browser/preload-browserView.ts', bundle: false },
];

/**
 * Compiles desktop entry points that Electron loads as standalone CommonJS scripts.
 */
export async function compileDesktopStandaloneFiles(repoRoot: string, outDir: string, minify: boolean): Promise<void> {
	const banner = `/*!--------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/`;

	await Promise.all(desktopStandaloneFiles.map(async entry => {
		const entryPath = path.join(repoRoot, 'src', entry.file);
		const outPath = path.join(repoRoot, outDir, entry.file.replace(/\.ts$/, '.js'));

		await esbuild.build({
			entryPoints: [entryPath],
			outfile: outPath,
			bundle: entry.bundle,
			external: entry.bundle ? ['electron'] : undefined,
			format: 'cjs',
			platform: 'node',
			target: ['es2024'],
			sourcemap: 'linked',
			sourcesContent: false,
			minify,
			banner: { js: banner },
			logLevel: 'warning',
		});
	}));
}
