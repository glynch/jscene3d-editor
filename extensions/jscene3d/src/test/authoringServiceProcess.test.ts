/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { AuthoringService, NodeAuthoringProcessLauncher } from '../authoring/authoringService';

suite('JScene3D authoring service process', () => {
	test('initializes and exercises valid, malformed, and semantic project opens', async function () {
		this.timeout(15000);
		const modulePath = process.env.JSCENE3D_AUTHORING_SERVICE_MODULE_PATH;
		if (modulePath === undefined || modulePath.trim().length === 0) {
			this.skip();
		}
		const logger = new TestLogger();
		const service = new AuthoringService(() => ({
			javaExecutable: process.env.JSCENE3D_JAVA_EXECUTABLE ?? 'java',
			modulePath: modulePath ?? ''
		}), new NodeAuthoringProcessLauncher(), logger);
		try {
			const valid = await service.openProject(fixture('valid', 'small-authoring-project.j3d'));
			assert.deepStrictEqual({
				opened: valid.opened,
				name: valid.project?.name,
				descriptor: path.basename(valid.project?.descriptor ?? ''),
				diagnostics: valid.diagnostics
			}, {
				opened: true,
				name: 'Small Authoring Project',
				descriptor: 'small-authoring-project.j3d',
				diagnostics: []
			});
			await service.closeProject();

			const malformed = await service.openProject(fixture('malformed', 'malformed.j3d'));
			assert.strictEqual(malformed.opened, false);
			assert.ok(malformed.diagnostics.length > 0);

			const semantic = await service.openProject(fixture('semantic-invalid', 'semantic-invalid.j3d'));
			assert.strictEqual(semantic.opened, false);
			assert.ok(semantic.diagnostics.length > 0);
		} finally {
			await service.shutdown();
		}
		assert.ok(logger.lines.includes('Starting JScene3D authoring service...'));
		assert.ok(logger.lines.some(line => line.startsWith('Authoring service initialized')));
		assert.ok(logger.lines.includes('Authoring service stopped'));
	});
});

class TestLogger {
	readonly lines: string[] = [];

	appendLine(message: string): void {
		this.lines.push(message);
	}
}

function fixture(directory: string, name: string): string {
	return path.join(__dirname, 'fixtures', 'projects', directory, name);
}
