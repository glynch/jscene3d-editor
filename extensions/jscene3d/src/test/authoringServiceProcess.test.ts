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
			installedExtensionMetadata: [],
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
			const definitionResponse = await service.openDefinition(generationA, 'e890c4c3-fb32-49d8-88b8-4e04e7a29656');
			const definition = definitionResponse.result;
			assert.notStrictEqual(definitionResponse.connectionGeneration.length, 0);
			assert.strictEqual(definition.definition?.context.kind, 'world-definition');
			assert.strictEqual(definition.definition?.context.origin, 'authored');
			assert.deepStrictEqual(definition.definition?.roots.map(root => root.label.text), ['Player']);

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

	test('passes installed extension metadata to the real Java service without loading runtime providers', async function () {
		this.timeout(15000);
		const modulePath = process.env.JSCENE3D_AUTHORING_SERVICE_MODULE_PATH;
		if (modulePath === undefined || modulePath.trim().length === 0) {
			this.skip();
		}
		const service = new AuthoringService(() => ({
			javaExecutable: process.env.JSCENE3D_JAVA_EXECUTABLE ?? 'java',
			modulePath: modulePath ?? '',
			installedExtensionMetadata: [installedExtensionFixture()],
			clientLanguage: 'en'
		}), new NodeAuthoringProcessLauncher(), new TestLogger());
		try {
			const opened = await service.openProject(fixture('installed', 'installed-project.j3d'));

			assert.strictEqual(opened.opened, true);
			assert.strictEqual(opened.project?.name, 'Installed Metadata Project');
			assert.deepStrictEqual(opened.diagnostics, []);
		} finally {
			await service.shutdown();
		}
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

function installedExtensionFixture(): string {
	return path.join(__dirname, 'fixtures', 'extensions', 'installed');
}
