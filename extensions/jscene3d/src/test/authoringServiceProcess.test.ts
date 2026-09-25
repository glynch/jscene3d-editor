/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { AuthoringService, NodeAuthoringProcessLauncher } from '../authoring/authoringService';

suite('JScene3D authoring service process', () => {
	test('opens A, rejects invalid B, replaces with valid B, closes, and shuts down', async function () {
		this.timeout(15000);
		const modulePath = process.env.JSCENE3D_AUTHORING_SERVICE_MODULE_PATH;
		if (modulePath === undefined || modulePath.trim().length === 0) {
			this.skip();
		}
		const logger = new TestLogger();
		const service = new AuthoringService(() => ({
			javaExecutable: process.env.JSCENE3D_JAVA_EXECUTABLE ?? 'java',
			modulePath: modulePath ?? '',
			clientLanguage: 'fr'
		}), new NodeAuthoringProcessLauncher(), logger);
		try {
			const validDescriptor = fixture('valid', 'small-authoring-project.j3d');
			const projectA = await service.openProject(validDescriptor);
			assert.deepStrictEqual({
				opened: projectA.opened,
				name: projectA.project?.name,
				root: projectA.project?.root,
				descriptor: projectA.project?.descriptor,
				diagnostics: projectA.diagnostics
			}, {
				opened: true,
				name: 'Small Authoring Project',
				root: path.dirname(validDescriptor),
				descriptor: validDescriptor,
				diagnostics: []
			});
			assert.notStrictEqual(projectA.projectGeneration, null);
			const generationA = projectA.projectGeneration ?? 0;

			const invalidB = await service.replaceProject(generationA, fixture('malformed', 'malformed.j3d'));
			assert.strictEqual(invalidB.outcome, 'candidateRejected');
			assert.ok(invalidB.diagnostics.some(diagnostic =>
				diagnostic.code === 'project.manifest.json'
				&& diagnostic.message === 'Le manifeste du projet n’est pas un manifeste JScene3D valide au format JSON'));

			const validBDescriptor = fixture('replacement', 'replacement-project.j3d');
			const projectB = await service.replaceProject(generationA, validBDescriptor);
			assert.strictEqual(projectB.outcome, 'replaced');
			if (projectB.outcome !== 'replaced') {
				throw new Error('Expected valid B to replace A');
			}
			assert.strictEqual(projectB.project.name, 'Replacement Authoring Project');
			assert.strictEqual(projectB.project.descriptor, validBDescriptor);
			assert.ok(projectB.projectGeneration > generationA);

			const closed = await service.closeProject();
			assert.deepStrictEqual(closed, {
				closed: true,
				invalidatedProjectGeneration: projectB.projectGeneration
			});
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
