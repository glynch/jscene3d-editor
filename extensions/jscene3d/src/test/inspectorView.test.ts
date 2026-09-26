/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { inspectorHtml, isInspectorMessage, revealInspector } from '../inspector/inspectorView';
import { inspectorSearchIndex, inspectorSearchResults } from '../inspector/inspectorViewModel';
import { InspectorSnapshotDto } from '../protocol/authoringProtocol';

suite('JScene3D Inspector view', () => {
	test('reveals the Inspector through its generated view focus command', async () => {
		const commands: string[] = [];

		await revealInspector(command => {
			commands.push(command);
		});

		assert.deepStrictEqual(commands, ['jscene3d.inspector.focus']);
	});

	test('searches group and property labels locally in authoritative order', () => {
		const results = inspectorSearchResults(snapshot(), 'move');

		assert.deepStrictEqual(results, [
			{ kind: 'group', groupId: 'movement', propertyId: null, label: 'Movement', groupLabel: 'Movement' },
			{ kind: 'property', groupId: 'movement', propertyId: 'speed', label: 'Move Speed', groupLabel: 'Movement' }
		]);
	});

	test('retains stable owning-group and property identities for cross-component navigation', () => {
		assert.deepStrictEqual(inspectorSearchResults(snapshot(), 'weapon'), [{
			kind: 'group', groupId: 'weapon-presentation', propertyId: null,
			label: 'Doom Weapon Presentation', groupLabel: 'Doom Weapon Presentation'
		}]);
		assert.deepStrictEqual(inspectorSearchResults(snapshot(), 'duration'), [{
			kind: 'property', groupId: 'weapon-presentation', propertyId: 'frame-duration',
			label: 'Frame Duration', groupLabel: 'Doom Weapon Presentation'
		}]);
		assert.ok(inspectorSearchIndex(snapshot()).some(result => result.groupId === 'weapon-presentation'
			&& result.propertyId === 'frame-duration'));
	});

	test('renders a restrictive CSP and the bounded two-pane Inspector shell', () => {
		const inspector = snapshot();
		const html = inspectorHtml('vscode-webview://test', {
			status: 'ready',
			selection: {
				projectGeneration: 1,
				assetId: 'world-a',
				occurrence: inspector.target.occurrence!,
				target: inspector.target
			},
			inspector,
			selectedGroupId: 'entity'
		}, 'en', translate);

		assert.match(html, /default-src 'none'/);
		assert.match(html, /style-src 'nonce-[^']+'/);
		assert.match(html, /script-src 'nonce-[^']+'/);
		assert.match(html, /navigator-scroll/);
		assert.match(html, /property-scroll/);
		assert.match(html, /role=\\?"separator/);
		assert.doesNotMatch(html, /onclick=/);
	});

	test('renders a localized visible search field and distinct accessible filter action', () => {
		const inspector = snapshot();
		const html = inspectorHtml('vscode-webview://test', {
			status: 'ready',
			selection: {
				projectGeneration: 1,
				assetId: 'world-a',
				occurrence: inspector.target.occurrence!,
				target: inspector.target
			},
			inspector,
			selectedGroupId: 'entity'
		}, 'en', message => `Localized: ${message}`);

		assert.match(html, /class="search-input" type="search"/);
		assert.match(html, /class="filter-button"/);
		assert.match(html, /aria-controls="inspector-search-results"/);
		assert.match(html, /aria-haspopup="menu"/);
		assert.match(html, /Localized: Filter components and properties…/);
		assert.match(html, /Localized: Filter options/);
		assert.match(html, /vscode\.getState\(\)/);
		assert.match(html, /vscode\.setState\(\{ query: searchInput\.value \}\)/);
		assert.match(html, /selectGroup\(result\.groupId, result\.propertyId\)/);
		assert.doesNotMatch(html, /icon-button|search-popover|⌕/);
		assert.doesNotMatch(html, /inspector\/read/);
	});

	test('keeps provenance in the snapshot while presenting ordinary default and authored states quietly', () => {
		const base = snapshot();
		const template = base.groups[1].properties[0];
		const inspector: InspectorSnapshotDto = {
			...base,
			groups: [base.groups[0], {
				...base.groups[1],
				properties: [template, {
					...template,
					identity: 'gravity',
					label: 'Gravity',
					state: {
						authoredValue: { kind: 'number', decimal: '18' },
						defaultValue: { kind: 'number', decimal: '9.8' },
						effectiveValue: { kind: 'number', decimal: '18' },
						origin: 'authored', validity: 'valid', editable: false
					}
				}, {
					...template,
					identity: 'optional-target',
					label: 'Optional Target',
					state: {
						authoredValue: null, defaultValue: null, effectiveValue: null,
						origin: 'unset', validity: 'valid', editable: false
					}
				}]
			}]
		};
		const html = inspectorHtml('vscode-webview://test', readyState(inspector, 'movement'), 'en', translate);

		assert.match(html, /"effectiveValue":\{"kind":"number","decimal":"4\.0"\}/);
		assert.match(html, /"origin":"default"/);
		assert.match(html, /"origin":"authored"/);
		assert.match(html, /"origin":"unset"/);
		assert.match(html, /"unset":"Unset"/);
		assert.doesNotMatch(html, /"defaultValue":"Default"/);
		assert.doesNotMatch(html, /Authored/);
	});

	test('retains read-only and missing-metadata presentation in the webview model', () => {
		const base = snapshot();
		const missingGroup = {
			...base.groups[1],
			metadataStatus: 'unavailable' as const,
			editable: false,
			properties: base.groups[1].properties.map(property => ({
				...property,
				state: { ...property.state, validity: 'metadata-unavailable' as const, editable: false },
				mutationTarget: null
			}))
		};
		const inspector: InspectorSnapshotDto = {
			...base,
			editable: false,
			groups: [{ ...base.groups[0], editable: false }, missingGroup]
		};

		const html = inspectorHtml('vscode-webview://test', {
			status: 'ready',
			selection: {
				projectGeneration: 1,
				assetId: 'world-a',
				occurrence: inspector.target.occurrence!,
				target: inspector.target
			},
			inspector,
			selectedGroupId: 'movement'
		}, 'en', translate);

		assert.match(html, /"metadataStatus":"unavailable"/);
		assert.match(html, /"validity":"metadata-unavailable"/);
		assert.match(html, /Descriptor metadata unavailable/);
		assert.match(html, /Read-only/);
	});

	test('accepts only the closed select-group webview message shape', () => {
		assert.strictEqual(isInspectorMessage({ type: 'selectGroup', groupId: 'movement' }), true);
		assert.strictEqual(isInspectorMessage({ type: 'selectGroup', groupId: '' }), false);
		assert.strictEqual(isInspectorMessage({ type: 'selectGroup', groupId: 'movement', extra: true }), false);
		assert.strictEqual(isInspectorMessage({ type: 'mutate', groupId: 'movement' }), false);
		assert.strictEqual(isInspectorMessage({ type: 'filter', query: 'duration' }), false);
	});
});

function translate(message: string, ...args: string[]): string {
	return args.reduce((value, argument, index) => value.replace(`{${index}}`, argument), message);
}

function readyState(inspector: InspectorSnapshotDto, selectedGroupId: string) {
	return {
		status: 'ready' as const,
		selection: {
			projectGeneration: 1,
			assetId: 'world-a',
			occurrence: inspector.target.occurrence!,
			target: inspector.target
		},
		inspector,
		selectedGroupId
	};
}

function snapshot(): InspectorSnapshotDto {
	const occurrence = { definitionAssetId: 'world-a', entityPath: ['entity-a'] };
	const target = {
		kind: 'local-entity' as const,
		source: 'file:///world.json',
		identity: 'entity-a',
		occurrence
	};
	return {
		revision: 0, target, title: 'Player', definitionOrigin: 'authored', provenance: 'local', editable: true,
		groups: [{
			identity: 'entity', kind: 'entity', label: 'Entity', description: null,
			componentId: null, componentType: null, metadataStatus: 'available', editable: true, properties: []
		}, {
			identity: 'movement', kind: 'component', label: 'Movement', description: null,
			componentId: 'movement', componentType: { id: 'example/movement', version: 1 },
			metadataStatus: 'available', editable: true,
			properties: [{
				identity: 'speed', label: 'Move Speed', description: 'Units per second', valueKind: 'number', required: false,
				constraints: {
					elementKind: null, exactElementCount: null, acceptedReferenceKinds: [],
					editor: { semantic: 'default', minimum: null, maximum: null }
				},
				state: {
					authoredValue: null, defaultValue: { kind: 'number', decimal: '4.0' },
					effectiveValue: { kind: 'number', decimal: '4.0' }, origin: 'default', validity: 'valid', editable: false
				},
				mutationTarget: null
			}]
		}, {
			identity: 'weapon-presentation', kind: 'component', label: 'Doom Weapon Presentation', description: null,
			componentId: 'weapon-presentation', componentType: { id: 'example/weapon-presentation', version: 1 },
			metadataStatus: 'available', editable: false,
			properties: [{
				identity: 'frame-duration', label: 'Frame Duration', description: 'Frame time', valueKind: 'number', required: false,
				constraints: {
					elementKind: null, exactElementCount: null, acceptedReferenceKinds: [],
					editor: { semantic: 'default', minimum: null, maximum: null }
				},
				state: {
					authoredValue: null, defaultValue: { kind: 'number', decimal: '0.1' },
					effectiveValue: { kind: 'number', decimal: '0.1' }, origin: 'default', validity: 'valid', editable: false
				},
				mutationTarget: null
			}]
		}]
	};
}
