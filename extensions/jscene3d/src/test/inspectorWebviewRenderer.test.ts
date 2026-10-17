/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { InspectorPresentation, InspectorPresentationProperty } from '../inspector/inspectorPresentation';
import {
	type InspectorWebviewElement,
	type InspectorWebviewElementEvent,
	type InspectorWebviewEnvironment,
	type InspectorWebviewBridge,
	runInspectorWebview
} from '../inspector/inspectorWebviewRenderer';
import type { ReadonlyPropertyEditorModel } from '../inspector/propertyEditorResolver';

suite('JScene3D Inspector webview renderer', () => {
	test('announces readiness only after installing the host message listener', () => {
		const root = new TestElement('main');
		let listenerInstalled = false;
		const host = new TestHost(message => {
			if (message.type === 'ready') {
				assert.strictEqual(listenerInstalled, true);
			}
		});

		runInspectorWebview('document-a', {
			document: new TestDocument(root), host,
			addHostMessageListener: () => listenerInstalled = true
		});

		assert.deepStrictEqual(host.messages, [{ type: 'ready', documentId: 'document-a' }]);
	});

	test('renders the empty, loading, and rejected presentations through one browser renderer', () => {
		const harness = new RendererHarness(emptyPresentation('empty'));
		const empty = harness.root.text;
		harness.deliver({ type: 'render', bootstrap: emptyPresentation('loading') });
		const loading = harness.root.text;
		harness.deliver({ type: 'render', bootstrap: rejectedPresentation() });

		assert.deepStrictEqual({ empty, loading, rejected: harness.root.text }, {
			empty: 'No entity selectedSelect an entity in the Hierarchy or Scene View to inspect its components.',
			loading: 'Loading Inspector…',
			rejected: 'Inspector data is unavailable.'
		});
	});

	test('renders ordered entity, component, property, accessibility, and editor presentation', () => {
		const harness = new RendererHarness(readyPresentation());

		assert.deepStrictEqual({
			name: harness.one('entity-name').value,
			nameLabel: harness.one('entity-name').attribute('aria-label'),
			components: harness.all('component-card').map(element => element.dataset.groupId),
			properties: harness.all('property').map(element => [element.dataset.propertyId, element.dataset.editorKind]),
			numericInvalid: harness.all('property-input')[0].attribute('aria-invalid'),
			deferred: [harness.one('deferred-checkbox').disabled, harness.one('add-component').disabled],
			badges: harness.all('badge').map(element => element.text)
		}, {
			name: 'Cube',
			nameLabel: 'Entity name',
			components: ['transform', 'rendering'],
			properties: [
				['speed', 'decimal'], ['count', 'integer'], ['position', 'vector3'],
				['rotation', 'eulerRotation'], ['orientation', 'quaternion'], ['color', 'linearColor'],
				['label', 'text'], ['mesh', 'reference']
			],
			numericInvalid: 'false',
			deferred: [true, true],
			badges: ['Descriptor metadata unavailable']
		});
	});

	test('produces typed boolean, scalar, compound, and text edit messages', () => {
		const harness = new RendererHarness(readyPresentation());
		const enabled = harness.one('property-checkbox');
		enabled.checked = false;
		enabled.dispatch('change');
		const speed = harness.all('property-input')[0];
		speed.value = '2.5';
		speed.dispatch('input');
		speed.dispatch('change');
		const position = harness.all('property-component-input').slice(0, 3);
		position[0].value = '4';
		position[0].dispatch('input');
		position[0].dispatch('keydown', { key: 'Enter' });
		const text = harness.all('property-input')[2];
		text.value = 'Renamed';
		text.dispatch('change');

		assert.deepStrictEqual(harness.host.messages, [{
			type: 'editProperty', documentId: 'document-a', groupId: 'entity', propertyId: 'enabled',
			candidate: { kind: 'boolean', value: false }
		}, {
			type: 'editProperty', documentId: 'document-a', groupId: 'transform', propertyId: 'speed',
			candidate: { kind: 'number', literal: '2.5' }
		}, {
			type: 'editProperty', documentId: 'document-a', groupId: 'transform', propertyId: 'position',
			candidate: { kind: 'number-array', literals: ['4', '2', '3'] }
		}, {
			type: 'editProperty', documentId: 'document-a', groupId: 'transform', propertyId: 'label',
			candidate: { kind: 'text', literal: 'Renamed' }
		}]);
	});

	test('rejects impossible post-input drafts without validation or mutation', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];
		speed.setSelectionRange(3, 3);
		speed.dispatch('select');
		speed.value = '4.0abc';
		speed.setSelectionRange(6, 6);
		speed.dispatch('input');
		harness.deliver({ type: 'prepareForDocumentClose', requestId: 7 });

		assert.deepStrictEqual({
			restored: [speed.value, speed.attribute('aria-invalid'), speed.selectionStart, speed.selectionEnd],
			close: harness.host.messages.at(-1),
			mutations: harness.host.messages.filter(message => (message as { type?: string }).type === 'editProperty')
		}, {
			restored: ['4.0', 'false', 3, 3],
			close: {
				type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 7, accepted: true
			},
			mutations: []
		});
	});

	test('accepts natural intermediate sequences but commits only complete drafts', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];
		for (const value of ['1', '1e', '1e-', '1e-3']) {
			speed.value = value;
			speed.setSelectionRange(value.length, value.length);
			speed.dispatch('input');
			assert.strictEqual(speed.value, value);
		}
		assert.deepStrictEqual(harness.host.messages, []);
		speed.dispatch('keydown', { key: 'Enter' });

		assert.deepStrictEqual(harness.host.messages, [{
			type: 'editProperty', documentId: 'document-a', groupId: 'transform', propertyId: 'speed',
			candidate: { kind: 'number', literal: '1e-3' }
		}]);

		speed.value = '-';
		speed.setSelectionRange(1, 1);
		speed.dispatch('input');
		harness.deliver({ type: 'prepareForDocumentClose', requestId: 8 });
		assert.deepStrictEqual(harness.host.messages.at(-1), {
			type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 8, accepted: false
		});
		speed.dispatch('keydown', { key: 'Escape' });
		assert.deepStrictEqual([speed.value, speed.attribute('aria-invalid'), speed.focused], ['1e-3', 'false', true]);
	});

	test('commits a complete pending draft during close preparation', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];
		speed.value = '-2.5E+7';
		speed.setSelectionRange(7, 7);
		speed.dispatch('input');
		harness.deliver({ type: 'prepareForDocumentClose', requestId: 9 });

		assert.deepStrictEqual(harness.host.messages, [{
			type: 'editProperty', documentId: 'document-a', groupId: 'transform', propertyId: 'speed',
			candidate: { kind: 'number', literal: '-2.5E+7' }
		}, {
			type: 'prepareForDocumentCloseResult', documentId: 'document-a', requestId: 9, accepted: true
		}]);
	});

	test('rejects invalid typing and paste atomically while preserving selection', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];

		const invalidTyping = speed.replaceSelection('x', 'insertText', 3, 3);
		assert.deepStrictEqual([invalidTyping, speed.value, speed.selectionStart, speed.selectionEnd], [true, '4.0', 3, 3]);
		const acceptedPaste = speed.replaceSelection('-1.25', 'insertFromPaste', 0, 3);
		assert.deepStrictEqual([acceptedPaste, speed.value], [false, '-1.25']);
		const invalidPaste = speed.replaceSelection('12abc', 'insertFromPaste', 0, 5);
		assert.deepStrictEqual(
			[invalidPaste, speed.value, speed.selectionStart, speed.selectionEnd], [true, '-1.25', 0, 5]);
		const secondDecimal = speed.replaceSelection('.', 'insertText', 5, 5);

		assert.deepStrictEqual({
			secondDecimal,
			value: speed.value,
			selection: [speed.selectionStart, speed.selectionEnd],
			ariaInvalid: speed.attribute('aria-invalid'),
			messages: harness.host.messages
		}, {
			secondDecimal: true,
			value: '-1.25',
			selection: [5, 5],
			ariaInvalid: 'false',
			messages: []
		});
	});

	test('filters resulting drafts across insertion, deletion, cut, drop, and input history', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];

		assert.strictEqual(speed.replaceSelection('2', 'insertText', 1, 1), false);
		assert.strictEqual(speed.value, '42.0');
		assert.strictEqual(speed.deleteContent('deleteContentBackward', 2, 2), false);
		assert.strictEqual(speed.value, '4.0');
		assert.strictEqual(speed.deleteContent('deleteContentForward', 1, 1), false);
		assert.strictEqual(speed.value, '40');
		assert.strictEqual(speed.replaceSelection('', 'deleteByCut', 0, 2), false);
		assert.strictEqual(speed.value, '');
		assert.strictEqual(speed.replaceSelection('12abc', 'insertFromDrop', 0, 0), true);
		assert.strictEqual(speed.value, '');

		speed.value = '2.5';
		speed.setSelectionRange(3, 3);
		speed.dispatch('input', { inputType: 'historyUndo' });
		assert.strictEqual(speed.value, '2.5');
		speed.dispatch('select');
		speed.value = '2.5x';
		speed.setSelectionRange(4, 4);
		speed.dispatch('input', { inputType: 'historyRedo' });

		assert.deepStrictEqual({
			value: speed.value,
			selection: [speed.selectionStart, speed.selectionEnd],
			messages: harness.host.messages
		}, { value: '2.5', selection: [3, 3], messages: [] });
	});

	test('applies the same rejection policy to integer, scalar, and compound controls', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];
		const count = harness.all('property-input')[1];
		const positionX = harness.all('property-component-input')[0];

		assert.strictEqual(speed.replaceSelection('x', 'insertText', 3, 3), true);
		assert.strictEqual(count.replaceSelection('.', 'insertText', 1, 1), true);
		assert.strictEqual(positionX.replaceSelection('abc', 'insertFromPaste', 0, 1), true);

		assert.deepStrictEqual({
			values: [speed.value, count.value, positionX.value],
			invalid: [speed.attribute('aria-invalid'), count.attribute('aria-invalid'), positionX.attribute('aria-invalid')],
			messages: harness.host.messages
		}, {
			values: ['4.0', '2', '1'],
			invalid: ['false', 'false', 'false'],
			messages: []
		});
	});

	test('defers IME validation until composition completes and restores invalid results', () => {
		const harness = new RendererHarness(readyPresentation());
		const speed = harness.all('property-input')[0];
		speed.setSelectionRange(0, 3);
		speed.dispatch('compositionstart');
		speed.value = 'temporary composition';
		speed.setSelectionRange(21, 21);
		speed.dispatch('input', { isComposing: true });
		assert.deepStrictEqual([speed.value, harness.host.messages], ['temporary composition', []]);

		speed.value = '1.25';
		speed.setSelectionRange(4, 4);
		speed.dispatch('compositionend');
		assert.strictEqual(speed.value, '1.25');

		speed.setSelectionRange(0, 4);
		speed.dispatch('compositionstart');
		speed.value = 'not-a-number';
		speed.setSelectionRange(12, 12);
		speed.dispatch('input', { isComposing: true });
		speed.dispatch('compositionend');

		assert.deepStrictEqual({
			value: speed.value,
			selection: [speed.selectionStart, speed.selectionEnd],
			invalid: speed.attribute('aria-invalid'),
			messages: harness.host.messages
		}, {
			value: '1.25', selection: [0, 4], invalid: 'false', messages: []
		});
	});

	test('applies host focus and render updates while preserving collapsed presentation state', () => {
		const harness = new RendererHarness(readyPresentation());
		const firstCard = harness.all('component-card')[0];
		firstCard.open = false;
		firstCard.dispatch('toggle');
		harness.deliver({ type: 'focusGroup', groupId: 'rendering' });
		const focusedCard = harness.all('component-card')[1];
		const replacement = readyPresentation('Crate');
		harness.deliver({ type: 'render', bootstrap: replacement });

		assert.deepStrictEqual({
			persisted: harness.host.state,
			focused: [focusedCard.open, focusedCard.scrolled],
			replacementTitle: harness.one('entity-name').value,
			restoredFirstCardOpen: harness.all('component-card')[0].open
		}, {
			persisted: { collapsedGroups: [collapseKey('transform')] },
			focused: [true, true],
			replacementTitle: 'Crate',
			restoredFirstCardOpen: false
		});
	});
});

class RendererHarness {
	readonly root = new TestElement('main');
	readonly document = new TestDocument(this.root);
	readonly host = new TestHost();
	private listener: ((message: unknown) => void) | undefined;

	constructor(presentation: InspectorPresentation) {
		const environment: InspectorWebviewEnvironment = {
			document: this.document,
			host: this.host,
			addHostMessageListener: listener => this.listener = listener
		};
		runInspectorWebview('document-a', environment);
		assert.deepStrictEqual(this.host.messages, [{ type: 'ready', documentId: 'document-a' }]);
		this.host.messages.length = 0;
		this.deliver({ type: 'render', bootstrap: presentation });
		assert.deepStrictEqual(this.host.messages, [{
			type: 'presentationApplied', documentId: 'document-a', deliveryId: 1
		}]);
		this.host.messages.length = 0;
	}

	deliver(message: unknown): void {
		const candidate = message as { readonly type?: string };
		this.listener?.({
			...message as object,
			documentId: 'document-a',
			...(candidate.type === 'render' || candidate.type === 'focusGroup'
				? { deliveryId: this.deliverySequence++ } : {})
		});
	}

	private deliverySequence = 1;

	one(className: string): TestElement {
		const matches = this.all(className);
		assert.strictEqual(matches.length, 1, `Expected one .${className}, found ${matches.length}`);
		return matches[0];
	}

	all(className: string): TestElement[] {
		return this.root.descendants().filter(element => element.hasClass(className));
	}
}

class TestHost implements InspectorWebviewBridge {
	readonly messages: unknown[] = [];
	state: unknown;

	constructor(private readonly onPost?: (message: import('../inspector/inspectorWebviewProtocol').InspectorWebviewToHostMessage) => void) { }

	postMessage(message: import('../inspector/inspectorWebviewProtocol').InspectorWebviewToHostMessage): void {
		this.messages.push(message);
		this.onPost?.(message);
	}

	getState(): unknown {
		return this.state;
	}

	setState(state: object): void {
		this.state = state;
	}
}

class TestDocument {
	constructor(private readonly root: TestElement) { }

	getElementById(id: string): InspectorWebviewElement | null {
		return id === 'app' ? this.root : null;
	}

	createElement(tagName: string): InspectorWebviewElement {
		return new TestElement(tagName);
	}
}

class TestElement implements InspectorWebviewElement {
	readonly children: TestElement[] = [];
	readonly dataset: Record<string, string | undefined> = {};
	readonly classList = {
		add: (...classNames: string[]) => {
			const classes = new Set(this.className.split(/\s+/).filter(Boolean));
			for (const className of classNames) {
				classes.add(className);
			}
			this.className = Array.from(classes).join(' ');
		},
		toggle: (className: string, force?: boolean) => {
			const classes = new Set(this.className.split(/\s+/).filter(Boolean));
			const enabled = force ?? !classes.has(className);
			if (enabled) {
				classes.add(className);
			} else {
				classes.delete(className);
			}
			this.className = Array.from(classes).join(' ');
			return enabled;
		}
	};
	className = '';
	textContent = '';
	innerHTML = '';
	title = '';
	type = '';
	inputMode = '';
	value = '';
	hidden = false;
	disabled = false;
	checked = false;
	open = false;
	tabIndex = 0;
	selectionStart: number | null = 0;
	selectionEnd: number | null = 0;
	selectionDirection: 'forward' | 'backward' | 'none' | null = 'none';
	parentElement: TestElement | null = null;
	focused = false;
	scrolled = false;
	private readonly attributes = new Map<string, string>();
	private readonly listeners = new Map<string, ((event: InspectorWebviewElementEvent) => void)[]>();

	constructor(readonly tagName: string) { }

	get text(): string {
		return this.textContent + this.children.map(child => child.text).join('');
	}

	hasClass(className: string): boolean {
		return this.className.split(/\s+/).includes(className);
	}

	descendants(): TestElement[] {
		return this.children.flatMap(child => [child, ...child.descendants()]);
	}

	append(...children: readonly InspectorWebviewElement[]): void {
		for (const child of children) {
			const element = child as TestElement;
			element.parentElement = this;
			this.children.push(element);
		}
	}

	replaceChildren(...children: readonly InspectorWebviewElement[]): void {
		this.children.splice(0, this.children.length);
		this.textContent = '';
		this.append(...children);
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	setSelectionRange(start: number, end: number, direction: 'forward' | 'backward' | 'none' = 'none'): void {
		this.selectionStart = start;
		this.selectionEnd = end;
		this.selectionDirection = direction;
	}

	attribute(name: string): string | undefined {
		return this.attributes.get(name);
	}

	addEventListener(type: string, listener: (event: InspectorWebviewElementEvent) => void): void {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	dispatch(type: string, options: {
		readonly key?: string;
		readonly data?: string | null;
		readonly inputType?: string;
		readonly isComposing?: boolean;
	} = {}): boolean {
		let prevented = false;
		const event: InspectorWebviewElementEvent = {
			target: this,
			key: options.key,
			data: options.data,
			inputType: options.inputType,
			isComposing: options.isComposing,
			preventDefault: () => prevented = true
		};
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
		return prevented;
	}

	replaceSelection(data: string, inputType: string, start: number, end: number): boolean {
		this.setSelectionRange(start, end);
		const prevented = this.dispatch('beforeinput', { data, inputType });
		if (!prevented) {
			this.value = this.value.slice(0, start) + data + this.value.slice(end);
			const caret = start + data.length;
			this.setSelectionRange(caret, caret);
			this.dispatch('input', { data, inputType });
		}
		return prevented;
	}

	deleteContent(inputType: 'deleteContentBackward' | 'deleteContentForward', start: number, end: number): boolean {
		this.setSelectionRange(start, end);
		const prevented = this.dispatch('beforeinput', { data: null, inputType });
		if (!prevented) {
			if (start !== end) {
				this.value = this.value.slice(0, start) + this.value.slice(end);
				this.setSelectionRange(start, start);
			} else if (inputType === 'deleteContentBackward' && start > 0) {
				this.value = this.value.slice(0, start - 1) + this.value.slice(end);
				this.setSelectionRange(start - 1, start - 1);
			} else if (inputType === 'deleteContentForward' && end < this.value.length) {
				this.value = this.value.slice(0, start) + this.value.slice(end + 1);
				this.setSelectionRange(start, start);
			}
			this.dispatch('input', { data: null, inputType });
		}
		return prevented;
	}

	closest(selector: string): InspectorWebviewElement | null {
		return selector === 'button' && this.tagName === 'button' ? this : this.parentElement?.closest(selector) ?? null;
	}

	focus(): void {
		this.focused = true;
	}

	scrollIntoView(): void {
		this.scrolled = true;
	}
}

function emptyPresentation(status: 'empty' | 'loading'): InspectorPresentation {
	return { status, strings: strings() };
}

function rejectedPresentation(): InspectorPresentation {
	return { status: 'rejected', failureCode: 'unavailable', strings: strings() };
}

function readyPresentation(title = 'Cube'): InspectorPresentation {
	const occurrence = { definitionAssetId: 'scene-a', entityPath: ['cube'] };
	return {
		status: 'ready',
		selectedGroupId: 'entity',
		strings: strings(),
		snapshot: {
			revision: 1,
			target: { kind: 'local-entity', source: 'file:///scene.json', identity: 'cube', occurrence },
			title,
			definitionOrigin: 'authored', provenance: 'local', editable: true,
			groups: [{
				identity: 'entity', kind: 'entity', label: 'Entity', description: null,
				componentId: null, componentType: null, metadataStatus: 'available', editable: true,
				properties: [property('enabled', 'Enabled', {
					kind: 'boolean', value: true, editable: true
				})]
			}, {
				identity: 'transform', kind: 'component', label: 'Transform 3D', description: 'Spatial state',
				componentId: 'transform', componentType: { id: 'jscene3d/transform-3d', version: 1 },
				metadataStatus: 'available', editable: true,
				properties: [
					property('speed', 'Speed', numericEditor('decimal', '4.0')),
					property('count', 'Count', numericEditor('integer', '2')),
					property('position', 'Position', componentEditor('vector3', ['X', 'Y', 'Z'], ['1', '2', '3'])),
					property('rotation', 'Rotation', componentEditor('eulerRotation', ['X', 'Y', 'Z'], ['0', '90', '0'], 'degrees')),
					property('orientation', 'Orientation', componentEditor('quaternion', ['X', 'Y', 'Z', 'W'], ['0', '0', '0', '1'])),
					property('color', 'Color', componentEditor('linearColor', ['R', 'G', 'B'], ['1', '0.5', '0'])),
					property('label', 'Label', { kind: 'text', value: 'Cube', editable: true })
				]
			}, {
				identity: 'rendering', kind: 'component', label: 'Mesh Renderer 3D', description: null,
				componentId: 'renderer', componentType: { id: 'jscene3d/mesh-renderer-3d', version: 1 },
				metadataStatus: 'unavailable', editable: false,
				properties: [property('mesh', 'Mesh', {
					kind: 'reference', label: 'sandbox-box-mesh', locator: 'mesh-a',
					resolution: 'resolved', revealUri: 'file:///mesh.json'
				}, false, 'metadata-unavailable')]
			}]
		}
	};
}

function property(
	identity: string,
	label: string,
	propertyEditor: ReadonlyPropertyEditorModel,
	editable = true,
	validity: InspectorPresentationProperty['state']['validity'] = 'valid'
): InspectorPresentationProperty {
	return {
		identity, label, description: null, valueKind: 'null', required: false,
		constraints: {
			elementKind: null, exactElementCount: null, acceptedReferenceKinds: [],
			editor: { semantic: 'default', minimum: null, maximum: null }
		},
		state: {
			authoredValue: null, defaultValue: null, effectiveValue: null,
			origin: 'authored', validity, editable, modified: false
		},
		mutationTarget: null,
		propertyEditor
	};
}

function numericEditor(kind: 'decimal' | 'integer', decimal: string): ReadonlyPropertyEditorModel {
	return {
		kind, decimal, editable: true, minimum: null, maximum: null,
		completePattern: '', intermediatePattern: ''
	};
}

function componentEditor(
	kind: 'vector3' | 'eulerRotation' | 'quaternion' | 'linearColor',
	labels: readonly ('X' | 'Y' | 'Z' | 'W' | 'R' | 'G' | 'B')[],
	values: readonly string[],
	unit: 'degrees' | null = null
): ReadonlyPropertyEditorModel {
	return {
		kind, collapsible: true, editable: true, completePattern: '', intermediatePattern: '', unit,
		components: labels.map((label, index) => ({ label, decimal: values[index] })),
		summary: values.join(', ')
	};
}

function strings(): InspectorPresentation['strings'] {
	return {
		inspector: 'Inspector', empty: 'No entity selected',
		emptyDetail: 'Select an entity in the Hierarchy or Scene View to inspect its components.',
		loading: 'Loading Inspector…', rejected: 'Inspector data is unavailable.', readOnly: 'Read-only',
		entityName: 'Entity name', enabled: 'Enabled', static: 'Static', tag: 'Tag', untagged: 'Untagged',
		layer: 'Layer', defaultLayer: 'Default', deferred: 'Not available yet', componentHelp: 'Component help',
		componentSettings: 'Component settings', componentActions: 'Component actions', addComponent: 'Add Component',
		chooseResource: 'Choose resource', unset: 'Unset', required: 'Required', broken: 'Broken reference',
		metadataUnavailable: 'Descriptor metadata unavailable', resolved: 'Resolved', trueValue: 'True',
		falseValue: 'False', invalidInteger: 'Invalid integer', invalidNumber: 'Invalid number',
		modified: 'Modified since last save', items: '{count} items', fields: '{count} fields'
	};
}

function collapseKey(groupId: string): string {
	return JSON.stringify(['local-entity', 'file:///scene.json', 'cube', 'scene-a', ['cube'], groupId]);
}
