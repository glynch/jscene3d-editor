/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { AuthoringProtocolClient, authoringProtocolMethods } from '../protocol/authoringProtocol';
import { JsonRpcClient, JsonRpcError } from '../protocol/jsonRpcClient';
import { JsonObject, JsonValue, MessageTransport } from '../protocol/messageTransport';

suite('JScene3D authoring protocol client', () => {
	test('initializes with the compatible Java contract fixture', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('fr-CA');
		transport.respond(fixture('initialize-response.json'));
		assert.deepStrictEqual(await initialization, {
			protocolVersion: { major: 2, minor: 1 },
			processKind: 'authoring',
			serviceVersion: '0.1.0-SNAPSHOT',
			engineVersion: '0.1.0-SNAPSHOT',
			capabilities: [
				'project/open', 'project/replace', 'project/close', 'viewport/prepareLaunch', 'definition/open', 'definition/mutate',
				'definition/undo', 'definition/redo', 'definition/save', 'definition/revert', 'definition/backup',
				'definition/restoreBackup', 'inspector/read', 'service/shutdown'
			]
		});
		assert.deepStrictEqual(transport.sent[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: { major: 2, minor: 1 }, clientLanguage: 'fr-CA' }
		});
	});

	test('prepares a generation-scoped Java project viewport launch', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const prepared = client.prepareViewportLaunch(7, 'world:a');
		const result = {
			prepared: true,
			launch: {
				projectGeneration: 7,
				projectId: 'project-a',
				projectName: 'Project A',
				projectRoot: '/projects/a',
				publishedContentRoot: '/projects/a/.jscene3d/published',
				engineVersion: '0.1.0-SNAPSHOT',
				sceneAssetId: 'world:a',
				sceneName: 'World A',
				runtimeArtifacts: ['/runtime/application.jar']
			},
			diagnostics: [],
			failureCode: null
		};
		transport.respond(success(2, result));

		assert.deepStrictEqual(await prepared, { connectionGeneration: 'connection-1', result });
		assert.deepStrictEqual(transport.sent[1], {
			jsonrpc: '2.0', id: 2, method: 'viewport/prepareLaunch', params: {
				expectedProjectGeneration: 7,
				sceneAssetId: 'world:a'
			}
		});
	});

	test('uses one protocol-method authority for required capabilities and requests', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('en');
		transport.respond(fixture('initialize-response.json'));
		const result = await initialization;
		const { initialize, ...operationMethods } = authoringProtocolMethods;

		assert.deepStrictEqual(result.capabilities, Object.values(operationMethods));
		assert.strictEqual(transport.sent[0].method, initialize);
	});

	test('opens a definition and validates its complete semantic hierarchy snapshot', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openDefinition(1, 'e890c4c3-fb32-49d8-88b8-4e04e7a29656');
		transport.respond(fixture('definition-open-response.json'));

		const response = await opened;
		const result = response.result;

		assert.strictEqual(response.connectionGeneration, 'connection-1');
		assert.strictEqual(result.definition?.context.kind, 'scene-definition');
		assert.strictEqual(result.definition?.roots[0].target.kind, 'local-entity');
		assert.deepStrictEqual(result.definition?.roots[0].occurrence.entityPath, [
			'0b295328-b5a3-4f41-9f34-e9b4abc430a7'
		]);
		assert.deepStrictEqual(transport.sent[1], {
			jsonrpc: '2.0',
			id: 2,
			method: 'definition/open',
			params: {
				expectedProjectGeneration: 1,
				assetId: 'e890c4c3-fb32-49d8-88b8-4e04e7a29656'
			}
		});
	});

	test('transports exact scalar mutation literals and validates authoritative lifecycle state', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const target = {
			kind: 'component-property' as const,
			occurrence: { definitionAssetId: 'world-a', entityPath: ['entity-a'] },
			entityId: 'entity-a', componentId: 'component-a', propertyId: 'speed'
		};
		const mutation = client.mutateDefinition(1, 'world-a', 4, target, {
			operation: 'set', value: { kind: 'number', literal: '0.00000000000000000001' }
		});
		const result = {
			definition: 'world-a', outcome: 'accepted', revision: 5,
			dirty: true, canUndo: true, canRedo: false, diagnostics: []
		};
		transport.respond(success(2, result));

		assert.deepStrictEqual(await mutation, result);
		assert.deepStrictEqual(transport.sent[1], {
			jsonrpc: '2.0', id: 2, method: 'definition/mutate', params: {
				expectedProjectGeneration: 1,
				assetId: 'world-a',
				expectedDefinitionRevision: 4,
				operation: 'set',
				target: { ...target, componentId: 'component-a', propertyId: 'speed' },
				value: { kind: 'number', value: null, literal: '0.00000000000000000001' }
			}
		});
	});

	test('rejects malformed definition hierarchy DTOs at runtime', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openDefinition(1, 'e890c4c3-fb32-49d8-88b8-4e04e7a29656');
		const response = fixture('definition-open-response.json');
		const result = object(response.result);
		const definition = object(result.definition);
		const roots = jsonArray(definition.roots);
		transport.respond({
			...response,
			result: {
				...result,
				definition: {
					...definition,
					roots: [{ ...object(roots[0]), kind: 'synthetic-world' }]
				}
			}
		});

		await assert.rejects(opened, /hierarchy node.kind is invalid/);
	});

	test('accepts authored read-only definitions and rejects editable generated definitions', async () => {
		const response = fixture('definition-open-response.json');
		const result = object(response.result);
		const definition = object(result.definition);
		const context = object(definition.context);
		const readOnlyTransport = new TestTransport();
		const readOnlyClient = await initializedClient(readOnlyTransport);
		const readOnly = readOnlyClient.openDefinition(1, 'definition-a');
		readOnlyTransport.respond({
			...response,
			result: { ...result, definition: { ...definition, context: { ...context, editable: false } } }
		});

		assert.strictEqual((await readOnly).result.definition?.context.editable, false);

		const generatedTransport = new TestTransport();
		const generatedClient = await initializedClient(generatedTransport);
		const generated = generatedClient.openDefinition(1, 'definition-a');
		generatedTransport.respond({
			...response,
			result: {
				...result,
				definition: { ...definition, context: { ...context, origin: 'generated', editable: true } }
			}
		});
		await assert.rejects(generated, /generated definition cannot be editable/);
	});

	test('accepts an exact definition-open rejection', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openDefinition(1, 'definition-a');
		const result = {
			opened: false,
			projectGeneration: null,
			definition: null,
			diagnostics: [],
			failureCode: 'definition.unavailable'
		};
		transport.respond(success(2, result));

		assert.deepStrictEqual(await opened, { connectionGeneration: 'connection-1', result });
	});

	test('rejects a definition response from a different Java connection generation', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openDefinition(1, 'definition-a');
		const response = fixture('definition-open-response.json');
		transport.respond({ ...response, connectionGeneration: 'connection-2' });

		await assert.rejects(opened, /connection generation changed unexpectedly/);
	});

	test('rejects partially populated definition-open failures', async () => {
		const response = fixture('definition-open-response.json');
		const valid = object(response.result);
		const invalidResults: readonly JsonObject[] = [
			{ ...valid, opened: false, definition: null, failureCode: 'definition.unavailable' },
			{ ...valid, opened: false, projectGeneration: null, failureCode: 'definition.unavailable' },
			{ ...valid, opened: false, failureCode: 'definition.unavailable' },
			{ ...valid, failureCode: 'definition.unavailable' }
		];
		for (const invalid of invalidResults) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const opened = client.openDefinition(1, 'definition-a');
			transport.respond(success(2, invalid));
			await assert.rejects(opened, /inconsistent (success|failure) shape/);
		}
	});

	test('reads and validates a complete Inspector snapshot with every tagged value kind', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const target = inspectorTarget();
		const reading = client.readInspector(1, 3, target);
		transport.respond(success(2, inspectorReadResult()));

		const result = await reading;

		assert.strictEqual(result.read, true);
		assert.strictEqual(result.snapshot?.groups[1].properties[0].state.effectiveValue?.kind, 'object');
		assert.strictEqual(result.snapshot?.groups[1].properties[1].state.defaultValue?.kind, 'array');
		assert.strictEqual(result.snapshot?.groups[1].properties[1].constraints.editor.semantic, 'vector3');
		assert.strictEqual(result.snapshot?.groups[1].properties[2].constraints.editor.semantic, 'euler-rotation');
		assert.deepStrictEqual(result.snapshot?.groups[1].properties[2].state.effectiveValue, {
			kind: 'array',
			values: [
				{ kind: 'number', decimal: '0' },
				{ kind: 'number', decimal: '90.0000000000000000001' },
				{ kind: 'number', decimal: '-2.5' }
			]
		});
		assert.deepStrictEqual(transport.sent[1], {
			jsonrpc: '2.0', id: 2, method: 'inspector/read',
			params: { expectedProjectGeneration: 1, expectedDefinitionRevision: 3, target }
		});
	});

	test('rejects every inconsistent Euler Inspector semantic shape', async () => {
		const valid = inspectorReadResult();
		const snapshot = object(valid.snapshot);
		const groups = jsonArray(snapshot.groups);
		const component = object(groups[1]);
		const properties = jsonArray(component.properties);
		const euler = object(properties[2]);
		const constraints = object(euler.constraints);
		const invalidEulerProperties: readonly JsonObject[] = [
			{
				...euler,
				valueKind: 'number',
				constraints: { ...constraints, elementKind: null, exactElementCount: null }
			},
			{
				...euler,
				constraints: { ...constraints, exactElementCount: 2 }
			},
			{
				...euler,
				constraints: { ...constraints, elementKind: 'text' }
			}
		];
		for (const invalidEuler of invalidEulerProperties) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const reading = client.readInspector(1, 3, inspectorTarget());
			transport.respond(success(2, {
				...valid,
				snapshot: {
					...snapshot,
					groups: [groups[0], { ...component, properties: [properties[0], properties[1], invalidEuler] }]
				}
			}));

			await assert.rejects(reading, /fixed numeric array/);
		}
	});

	test('rejects inconsistent Inspector results, decimal values, and semantic shapes', async () => {
		const valid = inspectorReadResult();
		const snapshot = object(valid.snapshot);
		const groups = jsonArray(snapshot.groups);
		const component = object(groups[1]);
		const properties = jsonArray(component.properties);
		const vector = object(properties[1]);
		const vectorConstraints = object(vector.constraints);
		const vectorState = object(vector.state);
		const vectorDefault = object(vectorState.defaultValue);
		const invalidResults: readonly JsonObject[] = [
			{ ...valid, read: false, failureCode: 'authoring.inspector.stale' },
			{ ...valid, snapshot: null },
			{ ...valid, failureCode: 'unexpected' },
			{
				...valid,
				snapshot: {
					...snapshot,
					groups: [groups[0], {
						...component,
						properties: [properties[0], {
							...vector,
							constraints: { ...vectorConstraints, exactElementCount: 2 }
						}]
					}]
				}
			},
			{
				...valid,
				snapshot: {
					...snapshot,
					groups: [groups[0], {
						...component,
						properties: [properties[0], {
							...vector,
							constraints: {
								...vectorConstraints,
								editor: {
									...object(vectorConstraints.editor),
									minimum: { decimal: '-100.0000000000000000001', inclusive: true }
								}
							}
						}]
					}]
				}
			},
			{
				...valid,
				snapshot: {
					...snapshot,
					groups: [groups[0], {
						...component,
						properties: [properties[0], {
							...vector,
							state: { ...vectorState, defaultValue: { ...vectorDefault, values: [{ kind: 'number', decimal: 0.1 }] } }
						}]
					}]
				}
			},
			{
				...valid,
				snapshot: {
					...snapshot,
					groups: [groups[0], {
						...component,
						properties: [{ ...object(properties[0]), mutationTarget: null }, properties[1]]
					}]
				}
			}
		];
		for (const invalid of invalidResults) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const reading = client.readInspector(1, 3, inspectorTarget());
			transport.respond(success(2, invalid));
			await assert.rejects(reading, /inconsistent|fixed numeric array|numeric bounds|decimal must be a string|editability/);
		}
	});

	test('accepts an exact Inspector rejection', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const reading = client.readInspector(1, 3, inspectorTarget());
		const rejected = {
			read: false, projectGeneration: null, snapshot: null, diagnostics: [],
			failureCode: 'authoring.inspector.stale'
		};
		transport.respond(success(2, rejected));

		assert.deepStrictEqual(await reading, rejected);
	});

	test('rejects an incompatible initialization', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('en');
		const response = fixture('initialize-response.json');
		const result = object(response.result);
		transport.respond({ ...response, result: { ...result, protocolVersion: { major: 3, minor: 0 } } });
		await assert.rejects(initialization, /Incompatible authoring protocol 3.0/);
	});

	test('rejects a service below the required compatible minor version', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('en');
		const response = fixture('initialize-response.json');
		const result = object(response.result);
		transport.respond({ ...response, result: { ...result, protocolVersion: { major: 2, minor: 0 } } });
		await assert.rejects(initialization, /Incompatible authoring protocol 2.0/);
	});

	test('rejects malformed client language tags before serialization', async () => {
		for (const language of ['', ' en', 'en_US', 'und']) {
			const transport = new TestTransport();
			const client = new AuthoringProtocolClient(new JsonRpcClient(transport));

			await assert.rejects(client.initialize(language), /clientLanguage/);
			assert.deepStrictEqual(transport.sent, []);
		}
	});

	test('rejects initialization without a required capability', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('en');
		const response = fixture('initialize-response.json');
		const result = object(response.result);
		transport.respond({ ...response, result: { ...result, capabilities: ['project/open'] } });
		await assert.rejects(initialization, /required capability project\/replace/);
	});

	test('sends typed replacement parameters and accepts replaced result', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const replacement = client.replaceProject(7, '/projects/b/b.j3d');
		transport.respond(fixture('project-replace-replaced-response.json'));

		const result = await replacement;

		assert.strictEqual(result.outcome, 'replaced');
		assert.strictEqual(result.projectGeneration, 8);
		assert.deepStrictEqual(transport.sent[1], {
			jsonrpc: '2.0',
			id: 2,
			method: 'project/replace',
			params: { expectedProjectGeneration: 7, path: '/projects/b/b.j3d' }
		});
	});

	test('accepts candidateRejected and conflict replacement outcomes', async () => {
		const candidateTransport = new TestTransport();
		const candidateClient = await initializedClient(candidateTransport);
		const candidate = candidateClient.replaceProject(7, '/projects/bad/bad.j3d');
		const candidateResponse = fixture('project-replace-candidate-rejected-response.json');
		candidateTransport.respond(candidateResponse);
		assert.deepStrictEqual(await candidate, object(candidateResponse.result));

		const conflictTransport = new TestTransport();
		const conflictClient = await initializedClient(conflictTransport);
		const conflict = conflictClient.replaceProject(7, '/projects/b/b.j3d');
		const conflictResponse = fixture('project-replace-conflict-response.json');
		conflictTransport.respond(conflictResponse);
		assert.deepStrictEqual(await conflict, object(conflictResponse.result));
	});

	test('rejects malformed replacement outcomes and outcome-specific shapes', async () => {
		const invalidResults: readonly JsonObject[] = [
			{ ...replacementResult('replaced'), outcome: 'accepted' },
			{ ...replacementResult('replaced'), projectGeneration: null },
			{ outcome: 'replaced', projectGeneration: 8, diagnostics: [], failureCode: null },
			{
				outcome: 'replaced',
				projectGeneration: 8,
				project: replacementResult('replaced').project,
				diagnostics: []
			},
			{ ...replacementResult('candidateRejected'), projectGeneration: 8 },
			{ ...replacementResult('conflict'), failureCode: null }
		];
		for (const invalid of invalidResults) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const replacement = client.replaceProject(7, '/projects/b/b.j3d');
			transport.respond(success(2, invalid));
			await assert.rejects(replacement, /outcome is invalid|inconsistent shape|project must be an object|failureCode must be a string/);
		}
	});

	test('rejects invalid replacement generations and diagnostics', async () => {
		const inputTransport = new TestTransport();
		const inputClient = await initializedClient(inputTransport);
		await assert.rejects(inputClient.replaceProject(0, '/projects/b/b.j3d'), /positive integer/);
		assert.strictEqual(inputTransport.sent.length, 1);

		for (const invalid of [
			{ ...replacementResult('replaced'), projectGeneration: 0 },
			{ ...replacementResult('candidateRejected'), diagnostics: [{ invalid: true }] }
		]) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const replacement = client.replaceProject(7, '/projects/b/b.j3d');
			transport.respond(success(2, invalid));
			await assert.rejects(replacement, /positive integer|diagnostic.severity/);
		}
	});

	test('correlates responses received out of request order', async () => {
		const transport = new TestTransport();
		const rpc = new JsonRpcClient(transport);
		const first = rpc.request('first', {}, stringValue);
		const second = rpc.request('second', {}, stringValue);
		transport.respond(success(2, 'second'));
		transport.respond(success(1, 'first'));
		assert.deepStrictEqual([(await first).result, (await second).result], ['first', 'second']);
	});

	test('rejects a protocol error', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('failing', {}, stringValue);
		transport.respond({
			jsonrpc: '2.0',
			id: 1,
			connectionGeneration: 'connection-1',
			error: { code: -32001, message: 'Incompatible protocol major version' }
		});
		await assert.rejects(request, (error: Error) => error instanceof JsonRpcError && error.code === -32001);
	});

	test('rejects pending requests when the transport terminates', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('pending', {}, stringValue);
		transport.terminate(new Error('process exited'));
		await assert.rejects(request, /process exited/);
	});

	test('treats an unknown response ID as a terminal connection failure', async () => {
		const transport = new TestTransport();
		const rpc = new JsonRpcClient(transport);
		let failure: Error | undefined;
		rpc.onDidFail(error => failure = error);
		const request = rpc.request('pending', {}, stringValue);
		transport.respond(success(2, 'wrong request'));
		await assert.rejects(request, /unknown response ID 2/);
		assert.match(failure?.message ?? '', /unknown response ID 2/);
	});

	test('rejects a response containing both a result and an error', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('invalid', {}, stringValue);
		transport.respond({
			...success(1, 'unexpected result'),
			error: { code: -32603, message: 'Internal error' }
		});
		await assert.rejects(request, /both a result and an error/);
	});

	test('rejects result and error field coexistence even when the error is null', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('invalid', {}, stringValue);
		transport.respond({ ...success(1, 'unexpected result'), error: null });
		await assert.rejects(request, /both a result and an error/);
	});

	test('rejects a non-integer structured protocol error code', async () => {
		const transport = new TestTransport();
		const request = new JsonRpcClient(transport).request('invalid', {}, stringValue);
		transport.respond({
			jsonrpc: '2.0',
			id: 1,
			connectionGeneration: 'connection-1',
			error: { code: -32603.5, message: 'Invalid error' }
		});
		await assert.rejects(request, /invalid error/);
	});

	test('rejects a project diagnostic with an unknown severity', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('en');
		transport.respond(fixture('initialize-response.json'));
		await initialization;

		const opened = client.openProject('/projects/small/small.j3d');
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const diagnostics = jsonArray(result.diagnostics);
		transport.respond({
			...response,
			result: {
				...result,
				diagnostics: [{ ...object(diagnostics[0]), severity: 'notice' }]
			}
		});
		await assert.rejects(opened, /diagnostic.severity/);
	});

	test('accepts an exact project-open failure with diagnostic-owned rejection', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openProject('/projects/invalid/invalid.j3d');
		const result = {
			opened: false,
			projectGeneration: null,
			project: null,
			diagnostics: [],
			failureCode: null
		};
		transport.respond(success(2, result));

		assert.deepStrictEqual(await opened, result);
	});

	test('rejects partially populated project-open failures', async () => {
		const response = fixture('project-open-response.json');
		const valid = object(response.result);
		const invalidResults: readonly JsonObject[] = [
			{ ...valid, opened: false, project: null, failureCode: 'project.invalid' },
			{ ...valid, opened: false, projectGeneration: null, failureCode: 'project.invalid' },
			{ ...valid, opened: false, failureCode: 'project.invalid' },
			{ ...valid, failureCode: 'project.invalid' }
		];
		for (const invalid of invalidResults) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const opened = client.openProject('/projects/invalid/invalid.j3d');
			transport.respond(success(2, invalid));
			await assert.rejects(opened, /inconsistent (success|failure) shape/);
		}
	});

	test('rejects malformed nested project data', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openProject('/projects/small/small.j3d');
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const project = object(result.project);
		transport.respond({ ...response, result: { ...result, project: { ...project, mainScene: { id: 7, name: 'Main' } } } });
		await assert.rejects(opened, /mainScene.id must be a string/);
	});

	test('rejects a non-integer project asset count', async () => {
		const transport = new TestTransport();
		const client = await initializedClient(transport);
		const opened = client.openProject('/projects/small/small.j3d');
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const project = object(result.project);
		transport.respond({
			...response,
			result: {
				...result,
				project: { ...project, assetCounts: { authored: 1.5, projected: 4 } }
			}
		});
		await assert.rejects(opened, /assetCounts.authored must be a non-negative integer/);
	});

	test('validates Java-owned semantic project catalog entries', async () => {
		const response = fixture('project-open-response.json');
		const result = object(response.result);
		const project = object(result.project);
		const catalog = object(project.catalog);
		const scene = object(jsonArray(catalog.scenes)[0]);
		for (const [entry, error] of [
			[{ ...scene, origin: 'unknown' }, /origin is invalid/],
			[{ ...scene, origin: 'generated', editable: true }, /generated catalog entry cannot be editable/],
			[{ ...scene, id: 'world:other' }, /stable configured identity/]
		] as const) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const opened = client.openProject('/projects/small/small.j3d');
			transport.respond({
				...response,
				result: {
					...result,
					project: { ...project, catalog: { ...catalog, scenes: [entry] } }
				}
			});
			await assert.rejects(opened, error);
		}
	});

	test('accepts exact project-close success and failure results', async () => {
		for (const result of [
			{ closed: true, invalidatedProjectGeneration: 7 },
			{ closed: false, invalidatedProjectGeneration: null }
		]) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const closed = client.closeProject();
			transport.respond(success(2, result));
			assert.deepStrictEqual(await closed, result);
		}
	});

	test('rejects inconsistent project-close results', async () => {
		for (const result of [
			{ closed: false, invalidatedProjectGeneration: 7 },
			{ closed: true, invalidatedProjectGeneration: null }
		]) {
			const transport = new TestTransport();
			const client = await initializedClient(transport);
			const closed = client.closeProject();
			transport.respond(success(2, result));
			await assert.rejects(closed, /inconsistent (success|failure) shape/);
		}
	});

	test('opens, closes, and shuts down using the Stage 1 DTOs', async () => {
		const transport = new TestTransport();
		const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
		const initialization = client.initialize('en');
		transport.respond(fixture('initialize-response.json'));
		await initialization;

		const opened = client.openProject('/projects/small/small.j3d');
		transport.respond(fixture('project-open-response.json'));
		const project = (await opened).project;
		assert.deepStrictEqual(project?.assetCounts, { authored: 3, projected: 4 });
		assert.deepStrictEqual(project?.catalog.scenes, [{
			id: 'world:main',
			name: 'Main World',
			source: 'file:///projects/small/content/main.scene.json',
			origin: 'authored',
			editable: true,
			mainScene: true
		}]);

		const closed = client.closeProject();
		transport.respond(fixture('project-close-response.json'));
		assert.deepStrictEqual(await closed, { closed: true, invalidatedProjectGeneration: 1 });

		const shutdown = client.shutdown();
		transport.respond(fixture('shutdown-response.json'));
		assert.deepStrictEqual(await shutdown, { shutdown: true });
		assert.deepStrictEqual(transport.sent.map(message => message.method), [
			'initialize',
			'project/open',
			'project/close',
			'service/shutdown'
		]);
	});
});

class TestTransport implements MessageTransport {
	readonly sent: JsonObject[] = [];
	private readonly messageListeners = new Set<(message: JsonObject) => void>();
	private readonly closeListeners = new Set<(error: Error) => void>();

	onMessage(listener: (message: JsonObject) => void): { dispose(): void } {
		this.messageListeners.add(listener);
		return { dispose: () => this.messageListeners.delete(listener) };
	}

	onClose(listener: (error: Error) => void): { dispose(): void } {
		this.closeListeners.add(listener);
		return { dispose: () => this.closeListeners.delete(listener) };
	}

	send(message: JsonObject): Promise<void> {
		this.sent.push(message);
		return Promise.resolve();
	}

	respond(message: JsonObject): void {
		for (const listener of this.messageListeners) {
			listener(message);
		}
	}

	terminate(error: Error): void {
		for (const listener of this.closeListeners) {
			listener(error);
		}
	}

	dispose(): void { }
}

function fixture(name: string): JsonObject {
	const parsed: unknown = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
	return object(parsed);
}

function object(value: unknown): JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Expected a JSON object fixture');
	}
	return value as JsonObject;
}

function jsonArray(value: JsonValue | undefined): readonly JsonValue[] {
	if (!Array.isArray(value)) {
		throw new Error('Expected a JSON array fixture');
	}
	return value;
}

async function initializedClient(transport: TestTransport): Promise<AuthoringProtocolClient> {
	const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
	const initialization = client.initialize('en');
	transport.respond(fixture('initialize-response.json'));
	await initialization;
	return client;
}

function success(id: number, result: JsonValue): JsonObject {
	return { jsonrpc: '2.0', id, connectionGeneration: 'connection-1', result };
}

function replacementResult(outcome: 'replaced' | 'candidateRejected' | 'conflict'): JsonObject {
	if (outcome === 'replaced') {
		const openedProject = object(fixture('project-open-response.json').result).project;
		if (openedProject === undefined) {
			throw new Error('Expected a project fixture');
		}
		return {
			outcome,
			projectGeneration: 8,
			project: openedProject,
			diagnostics: [],
			failureCode: null
		};
	}
	return {
		outcome,
		projectGeneration: null,
		project: null,
		diagnostics: [],
		failureCode: outcome === 'conflict' ? 'authoring.project.generationConflict' : null
	};
}

function inspectorTarget(): JsonObject & {
	readonly kind: 'local-entity'; readonly source: string; readonly identity: string;
	readonly occurrence: { readonly definitionAssetId: string; readonly entityPath: readonly string[] };
} {
	return {
		kind: 'local-entity',
		source: 'file:///project/worlds/main.scene.json',
		identity: 'entity-a',
		occurrence: { definitionAssetId: 'world-a', entityPath: ['entity-a'] }
	};
}

function inspectorReadResult(): JsonObject {
	const target = inspectorTarget();
	const occurrence = target.occurrence;
	const constraints = {
		elementKind: null,
		exactElementCount: null,
		acceptedReferenceKinds: [],
		editor: { semantic: 'default', minimum: null, maximum: null }
	};
	const semanticValues = {
		none: { kind: 'null' },
		flag: { kind: 'boolean', value: true },
		precision: { kind: 'number', decimal: '1234567890.12345678901234567890' },
		name: { kind: 'text', value: 'Player' },
		list: { kind: 'array', values: [{ kind: 'number', decimal: '1.25' }] },
		resource: {
			kind: 'reference', referenceKind: 'asset', locator: 'mesh', label: 'Player mesh',
			resolution: 'resolved', revealUri: 'file:///project/assets/player.glb'
		},
		brokenEntity: {
			kind: 'entity-target', entityId: 'missing', label: 'missing', resolution: 'broken', occurrence: null
		},
		component: {
			kind: 'component-target', entityId: 'entity-a', componentId: 'component-a',
			entityLabel: 'Player', componentLabel: 'Transform 3D',
			componentType: { id: 'jscene3d.spatial3d/transform-3d', version: 1 },
			resolution: 'resolved', occurrence
		}
	};
	return {
		read: true,
		projectGeneration: 1,
		snapshot: {
			revision: 3,
			target,
			title: 'Player',
			definitionOrigin: 'authored',
			provenance: 'local',
			editable: true,
			groups: [{
				identity: 'entity', kind: 'entity', label: 'Entity', description: null,
				componentId: null, componentType: null, metadataStatus: 'available', editable: true,
				properties: [{
					identity: 'enabled', label: 'Enabled', description: null, valueKind: 'boolean', required: false,
					constraints,
					state: {
						authoredValue: { kind: 'boolean', value: true }, defaultValue: null,
						effectiveValue: { kind: 'boolean', value: true }, origin: 'authored', validity: 'valid', editable: true,
						modified: false
					},
					mutationTarget: { kind: 'entity-enabled', occurrence, entityId: 'entity-a' }
				}]
			}, {
				identity: 'component-a', kind: 'component', label: 'Transform 3D', description: 'Placement transform',
				componentId: 'component-a', componentType: { id: 'jscene3d.spatial3d/transform-3d', version: 1 },
				metadataStatus: 'available', editable: true,
				properties: [{
					identity: 'semantic-values', label: 'Semantic values', description: null,
					valueKind: 'object', required: false, constraints,
					state: {
						authoredValue: { kind: 'object', values: semanticValues }, defaultValue: null,
						effectiveValue: { kind: 'object', values: semanticValues },
						origin: 'authored', validity: 'valid', editable: true, modified: false
					},
					mutationTarget: {
						kind: 'component-property', occurrence, entityId: 'entity-a',
						componentId: 'component-a', propertyId: 'semantic-values'
					}
				}, {
					identity: 'position', label: 'Position', description: null, valueKind: 'array', required: false,
					constraints: {
						elementKind: 'number', exactElementCount: 3, acceptedReferenceKinds: [],
						editor: {
							semantic: 'vector3',
							minimum: null,
							maximum: null
						}
					},
					state: {
						authoredValue: null,
						defaultValue: {
							kind: 'array', values: [
								{ kind: 'number', decimal: '0.0' }, { kind: 'number', decimal: '0.0' },
								{ kind: 'number', decimal: '0.0' }
							]
						},
						effectiveValue: {
							kind: 'array', values: [
								{ kind: 'number', decimal: '0.0' }, { kind: 'number', decimal: '0.0' },
								{ kind: 'number', decimal: '0.0' }
							]
						},
						origin: 'default', validity: 'valid', editable: false, modified: false
					},
					mutationTarget: null
				}, {
					identity: 'rotation', label: 'Rotation', description: null, valueKind: 'array', required: false,
					constraints: {
						elementKind: 'number', exactElementCount: 3, acceptedReferenceKinds: [],
						editor: { semantic: 'euler-rotation', minimum: null, maximum: null }
					},
					state: {
						authoredValue: null,
						defaultValue: {
							kind: 'array', values: [
								{ kind: 'number', decimal: '0' },
								{ kind: 'number', decimal: '90.0000000000000000001' },
								{ kind: 'number', decimal: '-2.5' }
							]
						},
						effectiveValue: {
							kind: 'array', values: [
								{ kind: 'number', decimal: '0' },
								{ kind: 'number', decimal: '90.0000000000000000001' },
								{ kind: 'number', decimal: '-2.5' }
							]
						},
						origin: 'default', validity: 'valid', editable: false, modified: false
					},
					mutationTarget: null
				}]
			}]
		},
		diagnostics: [],
		failureCode: null
	};
}

function stringValue(value: JsonValue): string {
	if (typeof value !== 'string') {
		throw new Error('Expected a string result');
	}
	return value;
}
