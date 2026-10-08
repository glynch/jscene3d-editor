/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { inspectorHtml, isInspectorMessage, revealInspector } from '../inspector/inspectorView';
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

	test('renders a restrictive CSP and one vertically scrolling component Inspector', () => {
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
		assert.match(html, /class="inspector-shell"/);
		assert.match(html, /class="inspector-scroll"/);
		assert.match(html, /class="entity-card"/);
		assert.match(html, /document\.createElement\('details'\); card\.className = 'component-card'/);
		assert.match(html, /overflow-y: auto/);
		assert.doesNotMatch(html, /navigator-scroll|property-scroll|role=\\?"separator/);
		assert.doesNotMatch(html, /onclick=/);
	});

	test('renders localized entity chrome and explicit deferred authoring controls', () => {
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

		assert.match(html, /class="entity-icon"/);
		assert.match(html, /class="entity-name" type="text" readonly/);
		assert.match(html, /class="deferred-checkbox" type="checkbox" disabled/);
		assert.match(html, /class="deferred-select tag-select" disabled/);
		assert.match(html, /class="deferred-select layer-select" disabled/);
		assert.match(html, /class="add-component" type="button" disabled/);
		assert.match(html, /Localized: Static/);
		assert.match(html, /Localized: Tag/);
		assert.match(html, /Localized: Layer/);
		assert.match(html, /Localized: Add Component/);
		assert.match(html, /Localized: Not available yet/);
		assert.match(html, /vscode\.getState\(\)/);
		assert.match(html, /vscode\.setState\(\{ collapsedGroups: Array\.from\(collapsedGroups\) \}\)/);
		assert.match(html, /snapshot\.groups\.filter\(candidate => candidate\.kind === 'component'\)/);
		assert.doesNotMatch(html, /search-input|filter-button/);
		assert.doesNotMatch(html, /inspector\/read/);
	});

	test('renders a polished no-selection state that mentions both selection surfaces', () => {
		const html = inspectorHtml('vscode-webview://test', { status: 'empty' }, 'en', translate);

		assert.match(html, /class="message-shell"/);
		assert.match(html, /"empty":"No entity selected"/);
		assert.match(html, /Select an entity in the Hierarchy or Scene View to inspect its components\./);
		assert.match(html, /class="message-icon"/);
	});

	test('renders exact text-backed scalar editors and posts typed candidates', () => {
		const base = snapshot();
		const speed = base.groups[1].properties[0];
		const inspector: InspectorSnapshotDto = {
			...base,
			groups: [base.groups[0], {
				...base.groups[1],
				properties: [{
					...speed,
					state: { ...speed.state, editable: true },
					mutationTarget: {
						kind: 'component-property', occurrence: base.target.occurrence!,
						entityId: 'entity-a', componentId: 'component-a', propertyId: 'speed'
					}
				}]
			}, base.groups[2]]
		};
		const html = inspectorHtml('vscode-webview://test', readyState(inspector, 'movement'), 'en', translate);

		assert.match(html, /"propertyEditor":\{"kind":"decimal","decimal":"4\.0","editable":true/);
		assert.match(html, /input\.type = 'text'/);
		assert.match(html, /input\.inputMode = editor\.kind === 'integer' \? 'numeric' : 'decimal'/);
		assert.match(html, /candidate: \{ kind: editor\.kind === 'integer' \? 'integer' : 'number', literal: input\.value \}/);
		assert.match(html, /className = 'property-validation'/);
		assert.match(html, /aria-invalid/);
		assert.match(html, /prepareForDocumentClose/);
		assert.doesNotMatch(html, /reportValidity|setCustomValidity|property-input:invalid/);
		assert.doesNotMatch(html, /parseFloat|parseInt|Number\(/);
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
						origin: 'authored', validity: 'valid', editable: false, modified: false
					}
				}, {
					...template,
					identity: 'optional-target',
					label: 'Optional Target',
					state: {
						authoredValue: null, defaultValue: null, effectiveValue: null,
						origin: 'unset', validity: 'valid', editable: false, modified: false
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

	test('marks only properties changed from the authoritative persisted baseline', () => {
		const base = snapshot();
		const changed = base.groups[1].properties[0];
		const inspector: InspectorSnapshotDto = {
			...base,
			groups: [base.groups[0], {
				...base.groups[1],
				properties: [{ ...changed, state: { ...changed.state, modified: true } }]
			}]
		};

		const html = inspectorHtml('vscode-webview://test', readyState(inspector, 'movement'), 'en', translate);

		assert.match(html, /"modified":true/);
		assert.match(html, /property\.state\.modified/);
		assert.match(html, /Modified since last save/);
		assert.match(html, /settings-modifiedItemIndicator/);
		assert.match(html, /border-left: 2px solid var\(--vscode-settings-modifiedItemIndicator, var\(--vscode-focusBorder\)\)/);
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

	test('renders typed semantic controls inside collapsible component cards', () => {
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
				origin: 'authored', validity: 'valid', editable: false, modified: false
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

		assert.match(html, /"propertyEditor":\{"kind":"decimal","decimal":"4\.0","editable":false,"minimum":null,"maximum":null/);
		assert.ok(html.includes('"kind":"vector2","collapsible":true,"unit":null,"components":[{"label":"X","decimal":"1.25"},{"label":"Y","decimal":"-4"}],"summary":"1.25, -4"'));
		assert.ok(html.includes('"kind":"vector3","collapsible":true,"unit":null,"components":[{"label":"X","decimal":"-6"},{"label":"Y","decimal":"0.875"},{"label":"Z","decimal":"6"}],"summary":"-6, 0.875, 6"'));
		assert.ok(html.includes('"kind":"eulerRotation","collapsible":true,"unit":"degrees","components":[{"label":"X","decimal":"0"},{"label":"Y","decimal":"90"},{"label":"Z","decimal":"-2.5"}],"summary":"0°, 90°, -2.5°"'));
		assert.ok(html.includes('"kind":"quaternion","collapsible":true,"unit":null,"components":[{"label":"X","decimal":"0"},{"label":"Y","decimal":"0"},{"label":"Z","decimal":"0"},{"label":"W","decimal":"1"}],"summary":"0, 0, 0, 1"'));
		assert.ok(html.includes('"kind":"linearColor","collapsible":true,"unit":null,"components":[{"label":"R","decimal":"1"},{"label":"G","decimal":"0.5"},{"label":"B","decimal":"2"}],"summary":"R 1, G 0.5, B 2"'));
		assert.ok(html.includes('"propertyEditor":{"kind":"collectionSummary","count":3}'));
		assert.ok(html.includes('"propertyEditor":{"kind":"reference","label":"Player mesh","resolution":"resolved","revealUri":"file:///project/assets/player.glb"}'));
		assert.match(html, /\.property-components \{[^}]*display: grid[^}]*grid-template-columns: repeat\(auto-fit, minmax\(54px, 1fr\)\)[^}]*\}/);
		assert.match(html, /\.property-component \{[^}]*display: grid[^}]*grid-template-columns: 13px minmax\(0, 1fr\)[^}]*\}/);
		assert.match(html, /\.property-component-value \{[^}]*width: 100%[^}]*text-align: right[^}]*\}/);
		assert.match(html, /\.entity-name, \.property-input, \.deferred-select, \.resource-field, \.property-component-value \{[^}]*border: 1px solid var\(--vscode-input-border, transparent\)[^}]*background: var\(--vscode-input-background\)[^}]*\}/);
		assert.match(html, /label\.className = 'property-component-label'; label\.textContent = component\.label/);
		assert.match(html, /value\.className = 'property-component-value';\s*value\.textContent = component\.decimal/);
		assert.match(html, /item\.append\(label, value\)/);
		assert.match(html, /component\.decimal \+ \(editor\.unit === 'degrees' \? '°' : ''\)/);
		assert.doesNotMatch(html, /value\.textContent = component\.label/);
		assert.match(html, /card\.open = !collapsedGroups\.has\(key\)/);
		assert.match(html, /card\.addEventListener\('toggle'/);
		assert.match(html, /componentIcon\(group\)/);
		assert.match(html, /renderResource\(container, semanticLabel\(editor\.label, editor\.resolution\)\)/);
	});

	test('accepts only the closed Inspector webview message shapes', () => {
		assert.strictEqual(isInspectorMessage({ type: 'selectGroup', groupId: 'movement' }), true);
		assert.strictEqual(isInspectorMessage({ type: 'selectGroup', groupId: '' }), false);
		assert.strictEqual(isInspectorMessage({ type: 'selectGroup', groupId: 'movement', extra: true }), false);
		assert.strictEqual(isInspectorMessage({
			type: 'editProperty', groupId: 'movement', propertyId: 'speed',
			candidate: { kind: 'number', literal: '0.00000000000000000001' }
		}), true);
		assert.strictEqual(isInspectorMessage({
			type: 'editProperty', groupId: 'movement', propertyId: 'speed',
			candidate: { kind: 'number', literal: 1 }
		}), false);
		assert.strictEqual(isInspectorMessage({
			type: 'prepareForDocumentCloseResult', requestId: 1, accepted: true
		}), true);
		assert.strictEqual(isInspectorMessage({
			type: 'prepareForDocumentCloseResult', requestId: 0, accepted: true
		}), false);
		assert.strictEqual(isInspectorMessage({
			type: 'prepareForDocumentCloseResult', requestId: 1, accepted: 'yes'
		}), false);
		assert.strictEqual(isInspectorMessage({
			type: 'prepareForDocumentCloseResult', requestId: 1, accepted: true, extra: true
		}), false);
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
			componentId: null, componentType: null, metadataStatus: 'available', editable: true,
			properties: [{
				identity: 'enabled', label: 'Enabled', description: null, valueKind: 'boolean', required: true,
				constraints: {
					elementKind: null, exactElementCount: null, acceptedReferenceKinds: [],
					editor: { semantic: 'default', minimum: null, maximum: null }
				},
				state: {
					authoredValue: { kind: 'boolean', value: true }, defaultValue: null,
					effectiveValue: { kind: 'boolean', value: true }, origin: 'authored', validity: 'valid',
					editable: true, modified: false
				},
				mutationTarget: { kind: 'entity-enabled', occurrence, entityId: 'entity-a' }
			}]
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
					effectiveValue: { kind: 'number', decimal: '4.0' }, origin: 'default', validity: 'valid', editable: false,
					modified: false
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
					effectiveValue: { kind: 'number', decimal: '0.1' }, origin: 'default', validity: 'valid', editable: false,
					modified: false
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
			origin: 'authored', validity: 'valid', editable: false, modified: false
		},
		mutationTarget: null
	};
}
