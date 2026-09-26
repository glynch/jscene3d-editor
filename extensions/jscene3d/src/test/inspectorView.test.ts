/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { inspectorHtml, isInspectorMessage, revealInspector } from '../inspector/inspectorView';
import { inspectorSearchIndex, inspectorSearchResults } from '../inspector/inspectorViewModel';
import {
	InspectorEditorSemanticsDto,
	InspectorPropertyDto,
	InspectorSnapshotDto
} from '../protocol/authoringProtocol';

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
		assert.match(html, /vscode\.setState\(\{ query: searchInput\.value, collapsedProperties: Array\.from\(collapsedProperties\) \}\)/);
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

	test('renders collapsible semantic properties with compact exact components', () => {
		const base = snapshot();
		const reference: InspectorPropertyDto = {
			...base.groups[1].properties[0],
			identity: 'mesh', label: 'Mesh', valueKind: 'reference',
			state: {
				authoredValue: {
					kind: 'reference', referenceKind: 'asset', locator: 'mesh', label: 'Player mesh',
					resolution: 'resolved', revealUri: 'file:///project/assets/player.glb'
				},
				defaultValue: null,
				effectiveValue: {
					kind: 'reference', referenceKind: 'asset', locator: 'mesh', label: 'Player mesh',
					resolution: 'resolved', revealUri: 'file:///project/assets/player.glb'
				},
				origin: 'authored', validity: 'valid', editable: false
			}
		};
		const inspector: InspectorSnapshotDto = {
			...base,
			groups: [base.groups[0], {
				...base.groups[1],
				properties: [
					base.groups[1].properties[0],
					semanticArrayProperty('size', 'Size', 'vector2', ['1.25', '-4']),
					semanticArrayProperty('position', 'Position', 'vector3', ['-6', '0.875', '6']),
					semanticArrayProperty('rotation', 'Rotation', 'euler-rotation', ['0', '90', '-2.5']),
					semanticArrayProperty('orientation', 'Orientation', 'quaternion', ['0', '0', '0', '1']),
					semanticArrayProperty('color', 'Color', 'color-linear', ['1', '0.5', '2']),
					semanticArrayProperty('samples', 'Samples', 'default', ['1', '2', '3']),
					reference
				]
			}]
		};

		const html = inspectorHtml('vscode-webview://test', readyState(inspector, 'movement'), 'en', translate);

		assert.ok(html.includes('"propertyEditor":{"kind":"decimal","decimal":"4.0","minimum":null,"maximum":null}'));
		assert.ok(html.includes('"kind":"vector2","collapsible":true,"unit":null,"components":[{"label":"X","decimal":"1.25"},{"label":"Y","decimal":"-4"}],"summary":"1.25, -4"'));
		assert.ok(html.includes('"kind":"vector3","collapsible":true,"unit":null,"components":[{"label":"X","decimal":"-6"},{"label":"Y","decimal":"0.875"},{"label":"Z","decimal":"6"}],"summary":"-6, 0.875, 6"'));
		assert.ok(html.includes('"kind":"eulerRotation","collapsible":true,"unit":"degrees","components":[{"label":"X","decimal":"0"},{"label":"Y","decimal":"90"},{"label":"Z","decimal":"-2.5"}],"summary":"0°, 90°, -2.5°"'));
		assert.ok(html.includes('"kind":"quaternion","collapsible":true,"unit":null,"components":[{"label":"X","decimal":"0"},{"label":"Y","decimal":"0"},{"label":"Z","decimal":"0"},{"label":"W","decimal":"1"}],"summary":"0, 0, 0, 1"'));
		assert.ok(html.includes('"kind":"linearColor","collapsible":true,"unit":null,"components":[{"label":"R","decimal":"1"},{"label":"G","decimal":"0.5"},{"label":"B","decimal":"2"}],"summary":"R 1, G 0.5, B 2"'));
		assert.ok(html.includes('"propertyEditor":{"kind":"collectionSummary","count":3}'));
		assert.ok(html.includes('"propertyEditor":{"kind":"reference","label":"Player mesh","resolution":"resolved","revealUri":"file:///project/assets/player.glb"}'));
		assert.match(html, /\.property-components \{[^}]*display: flex[^}]*flex-wrap: wrap[^}]*\}/);
		assert.match(html, /\.property-component \{[^}]*display: inline-flex[^}]*flex: 0 1 auto[^}]*\}/);
		assert.match(html, /\.property-component-value \{[^}]*min-width: 48px[^}]*width: max-content[^}]*max-width: 24ch[^}]*\}/);
		assert.match(html, /\.property-component-label \{[^}]*color: var\(--vscode-descriptionForeground\)[^}]*font-weight: 400[^}]*\}/);
		assert.match(html, /\.property-component-value \{[^}]*border: 1px solid var\(--vscode-input-border, transparent\)[^}]*background: var\(--vscode-input-background\)[^}]*\}/);
		assert.match(html, /label\.className = 'property-component-label'; label\.textContent = component\.label/);
		assert.match(html, /value\.className = 'property-component-value';\s*value\.textContent = component\.decimal/);
		assert.match(html, /item\.append\(label, value\)/);
		assert.match(html, /component\.decimal \+ \(editor\.unit === 'degrees' \? '°' : ''\)/);
		assert.doesNotMatch(html, /value\.textContent = component\.label/);
		assert.doesNotMatch(html, /join\('  ·  '\)/);
		assert.match(html, /property\.propertyEditor\.collapsible === true/);
		assert.match(html, /document\.createElement\('button'\); disclosure\.type = 'button'/);
		assert.match(html, /disclosure\.setAttribute\('aria-expanded', String\(expanded\)\)/);
		assert.match(html, /summary\.hidden = expanded;\s*value\.hidden = !expanded/);
		assert.match(html, /setExpanded\(!collapsedProperties\.has\(key\), false\)/);
		assert.match(html, /snapshot\.target\.identity[\s\S]*groupId, propertyId/);
		assert.match(html, /collapsedProperties: Array\.from\(collapsedProperties\)/);
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

function semanticArrayProperty(
	identity: string,
	label: string,
	semantic: InspectorEditorSemanticsDto['semantic'],
	decimals: readonly string[]
): InspectorPropertyDto {
	const value = { kind: 'array' as const, values: decimals.map(decimal => ({ kind: 'number' as const, decimal })) };
	return {
		identity, label, description: null, valueKind: 'array', required: false,
		constraints: {
			elementKind: 'number', exactElementCount: decimals.length, acceptedReferenceKinds: [],
			editor: { semantic, minimum: null, maximum: null }
		},
		state: {
			authoredValue: value, defaultValue: null, effectiveValue: value,
			origin: 'authored', validity: 'valid', editable: false
		},
		mutationTarget: null
	};
}
