/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DefinitionMutationValueDto } from '../protocol/authoringProtocol';
import type { InspectorPresentationProperty, InspectorPresentationStrings } from './inspectorPresentation';
import type { InspectorElementFactory, InspectorWebviewElement, InspectorWebviewHost } from './inspectorWebviewDom';
import { NumericDraftController } from './numericDraftController';
import type { ReadonlyPropertyEditorModel } from './propertyEditorResolver';

/** Pending browser-side numeric edit coordinated during document close. */
export interface PendingNumericEditor {
	commit(): boolean;
	focus(): void;
}

/** Property-control rendering operations consumed by the Inspector shell renderer. */
export interface InspectorPropertyRenderer {
	renderProperty(groupId: string, property: InspectorPresentationProperty): InspectorWebviewElement;
	renderPropertyEditor(
		container: InspectorWebviewElement,
		editor: ReadonlyPropertyEditorModel,
		groupId: string,
		propertyId: string
	): void;
}

/** Dependencies of the built-in property-control renderer. */
export interface InspectorPropertyRendererContext {
	readonly host: InspectorWebviewHost;
	readonly strings: InspectorPresentationStrings;
	readonly element: InspectorElementFactory;
	readonly pendingNumericEditors: Set<PendingNumericEditor>;
}

/** Creates built-in property controls and owns their browser-local interaction wiring. */
export function createInspectorPropertyRenderer(
	context: InspectorPropertyRendererContext
): InspectorPropertyRenderer {
	const { host, strings, element, pendingNumericEditors } = context;
	let validationSequence = 0;

	function showValidation(
		field: { readonly input: InspectorWebviewElement; readonly validation: InspectorWebviewElement },
		show: boolean,
		message: string
	): void {
		field.input.classList.toggle('validation-error', show);
		field.input.setAttribute('aria-invalid', String(show));
		field.validation.textContent = show ? message : '';
		field.validation.hidden = !show;
	}

	function registerNumericEditor(
		fields: readonly { readonly input: InspectorWebviewElement; readonly validation: InspectorWebviewElement }[],
		kind: 'integer' | 'number',
		candidate: (values: readonly string[]) => DefinitionMutationValueDto,
		groupId: string,
		propertyId: string,
		invalidMessage: string
	): void {
		const draft = new NumericDraftController(kind, fields.map(field => field.input.value));
		type Selection = {
			readonly start: number;
			readonly end: number;
			readonly direction: 'forward' | 'backward' | 'none';
		};
		const acceptedSelections = fields.map(field => readSelection(field.input));
		const pendingSelections: Array<Selection | undefined> = fields.map(() => undefined);
		const compositionSelections: Array<Selection | undefined> = fields.map(() => undefined);
		const composing = fields.map(() => false);

		function readSelection(input: InspectorWebviewElement): Selection {
			const fallback = input.value.length;
			return {
				start: input.selectionStart ?? fallback,
				end: input.selectionEnd ?? fallback,
				direction: input.selectionDirection ?? 'none'
			};
		}

		function restoreSelection(input: InspectorWebviewElement, selection: Selection): void {
			const start = Math.min(selection.start, input.value.length);
			const end = Math.min(selection.end, input.value.length);
			input.setSelectionRange(start, end, selection.direction);
		}

		function replaceSelection(value: string, selection: Selection, replacement: string): string {
			return value.slice(0, selection.start) + replacement + value.slice(selection.end);
		}

		function beforeInputValue(
			input: InspectorWebviewElement,
			event: import('./inspectorWebviewDom').InspectorWebviewElementEvent,
			selection: Selection
		): string | undefined {
			const inputType = event.inputType;
			if (inputType === undefined) {
				return undefined;
			}
			if (inputType === 'insertText' || inputType === 'insertFromPaste'
				|| inputType === 'insertFromDrop' || inputType === 'insertReplacementText') {
				return event.data === undefined || event.data === null
					? undefined : replaceSelection(input.value, selection, event.data);
			}
			if (!inputType.startsWith('delete')) {
				return undefined;
			}
			if (selection.start !== selection.end) {
				return replaceSelection(input.value, selection, '');
			}
			if (inputType === 'deleteContentBackward' && selection.start > 0) {
				return input.value.slice(0, selection.start - 1) + input.value.slice(selection.end);
			}
			if (inputType === 'deleteContentForward' && selection.end < input.value.length) {
				return input.value.slice(0, selection.start) + input.value.slice(selection.end + 1);
			}
			return input.value;
		}

		function synchronizePending(editor: PendingNumericEditor): void {
			if (draft.snapshot.pending) {
				pendingNumericEditors.add(editor);
			} else {
				pendingNumericEditors.delete(editor);
			}
		}
		for (const field of fields) {
			field.validation.setAttribute('id', `property-validation-${++validationSequence}`);
			field.input.setAttribute('aria-describedby', `property-validation-${validationSequence}`);
			field.input.setAttribute('aria-invalid', 'false');
		}
		const numericEditor: PendingNumericEditor = {
			commit: (): boolean => {
				const result = draft.commit();
				const state = draft.snapshot;
				fields.forEach((field, index) => showValidation(field, state.validationVisible[index], invalidMessage));
				if (result.kind === 'invalid') {
					pendingNumericEditors.add(numericEditor);
					return false;
				}
				pendingNumericEditors.delete(numericEditor);
				if (result.kind === 'committed') {
					host.postMessage({ type: 'editProperty', groupId, propertyId, candidate: candidate(result.values) });
				}
				return true;
			},
			focus: (): void => {
				const index = draft.snapshot.statuses.findIndex(status => status !== 'complete');
				fields[Math.max(index, 0)]?.input.focus();
			}
		};

		function acceptInput(index: number, rejectedSelection?: Selection): void {
			const field = fields[index];
			const transition = draft.update(index, field.input.value);
			const state = draft.snapshot;
			if (transition.kind === 'rejected') {
				field.input.value = transition.value;
				restoreSelection(field.input, rejectedSelection ?? acceptedSelections[index]);
			} else {
				acceptedSelections[index] = readSelection(field.input);
			}
			showValidation(field, state.validationVisible[index], invalidMessage);
			synchronizePending(numericEditor);
			pendingSelections[index] = undefined;
		}

		fields.forEach((field, index) => {
			field.input.addEventListener('beforeinput', event => {
				if (composing[index] || event.isComposing || event.inputType === 'insertCompositionText') {
					return;
				}
				const selection = readSelection(field.input);
				const proposed = beforeInputValue(field.input, event, selection);
				if (proposed !== undefined && draft.classify(proposed) === 'invalid') {
					event.preventDefault();
					return;
				}
				pendingSelections[index] = selection;
			});
			field.input.addEventListener('input', event => {
				if (composing[index] || event.isComposing) {
					return;
				}
				acceptInput(index, pendingSelections[index]);
			});
			field.input.addEventListener('compositionstart', () => {
				composing[index] = true;
				compositionSelections[index] = readSelection(field.input);
			});
			field.input.addEventListener('compositionend', () => {
				composing[index] = false;
				acceptInput(index, compositionSelections[index]);
				compositionSelections[index] = undefined;
			});
			field.input.addEventListener('change', () => numericEditor.commit());
			field.input.addEventListener('keydown', event => {
				if (event.key === 'Enter') {
					numericEditor.commit();
				} else if (event.key === 'Escape') {
					draft.cancel();
					const state = draft.snapshot;
					fields.forEach((candidateField, candidateIndex) => {
						candidateField.input.value = state.values[candidateIndex];
						acceptedSelections[candidateIndex] = readSelection(candidateField.input);
						showValidation(candidateField, false, invalidMessage);
					});
					pendingNumericEditors.delete(numericEditor);
					field.input.focus();
				}
			});
			for (const eventType of ['click', 'focus', 'keyup', 'select']) {
				field.input.addEventListener(eventType, () => acceptedSelections[index] = readSelection(field.input));
			}
		});
	}

	function semanticLabel(label: string | null, resolution: 'resolved' | 'broken' | null): string {
		return label === null ? '—' : label + (resolution === 'broken' ? ` · ${strings.broken}` : '');
	}

	function renderResource(
		container: InspectorWebviewElement, label: string, locator: string | null, revealUri: string | null
	): void {
		const control = element('div', 'resource-control');
		const field = element('div', 'resource-field', label);
		field.title = [label, locator, revealUri].filter(Boolean).join('\n');
		const action = element('button', 'resource-action', '◎');
		action.type = 'button';
		action.disabled = true;
		action.setAttribute('aria-label', strings.chooseResource);
		action.setAttribute('title', strings.deferred);
		control.append(field, action);
		container.append(control);
	}

	function renderComponents(
		container: InspectorWebviewElement,
		editor: Extract<ReadonlyPropertyEditorModel, { readonly kind: 'vector2' | 'vector3' | 'eulerRotation' | 'quaternion' | 'linearColor' }>,
		groupId: string,
		propertyId: string
	): void {
		const components = element('div', 'property-components');
		const fields: { input: InspectorWebviewElement; validation: InspectorWebviewElement }[] = [];
		for (const component of editor.components) {
			const item = element('div', 'property-component');
			const label = element('span', 'property-component-label', component.label);
			if (!editor.editable) {
				const value = element('span', 'property-component-value',
					component.decimal === null ? '—' : component.decimal + (editor.unit === 'degrees' ? '°' : ''));
				item.append(label, value);
				components.append(item);
				continue;
			}
			const input = element('input', 'property-component-input');
			input.type = 'text';
			input.inputMode = 'decimal';
			input.value = component.decimal ?? '';
			const validation = element('div', 'property-validation');
			validation.hidden = true;
			item.append(label, input, validation);
			components.append(item);
			fields.push({ input, validation });
		}
		if (editor.editable) {
			registerNumericEditor(fields, 'number', values => ({ kind: 'number-array', literals: values }),
				groupId, propertyId, strings.invalidNumber);
		}
		container.append(components);
	}

	function renderPropertyEditor(
		container: InspectorWebviewElement,
		editor: ReadonlyPropertyEditorModel,
		groupId: string,
		propertyId: string
	): void {
		switch (editor.kind) {
			case 'boolean': {
				const input = element('input', 'property-checkbox');
				input.type = 'checkbox';
				input.checked = editor.value === true;
				input.disabled = !editor.editable;
				if (editor.editable) {
					input.addEventListener('change', () => host.postMessage({
						type: 'editProperty', groupId, propertyId,
						candidate: { kind: 'boolean', value: input.checked }
					}));
				}
				container.append(input);
				return;
			}
			case 'decimal':
			case 'integer': {
				if (!editor.editable) {
					container.textContent = editor.decimal ?? '—';
					return;
				}
				const input = element('input', 'property-input');
				input.type = 'text';
				input.value = editor.decimal ?? '';
				input.inputMode = editor.kind === 'integer' ? 'numeric' : 'decimal';
				const validation = element('div', 'property-validation');
				validation.hidden = true;
				const kind = editor.kind === 'integer' ? 'integer' : 'number';
				registerNumericEditor([{ input, validation }], kind, values => ({ kind, literal: values[0] }),
					groupId, propertyId, editor.kind === 'integer' ? strings.invalidInteger : strings.invalidNumber);
				container.append(input, validation);
				return;
			}
			case 'text': {
				if (!editor.editable) {
					container.textContent = editor.value ?? '—';
					return;
				}
				const input = element('input', 'property-input');
				input.type = 'text';
				input.value = editor.value ?? '';
				input.addEventListener('change', () => host.postMessage({
					type: 'editProperty', groupId, propertyId, candidate: { kind: 'text', literal: input.value }
				}));
				container.append(input);
				return;
			}
			case 'vector2':
			case 'vector3':
			case 'eulerRotation':
			case 'quaternion':
			case 'linearColor':
				renderComponents(container, editor, groupId, propertyId);
				return;
			case 'reference':
				renderResource(container, semanticLabel(editor.label, editor.resolution), editor.locator, editor.revealUri);
				return;
			case 'entityTarget':
				container.textContent = semanticLabel(editor.label, editor.resolution);
				return;
			case 'componentTarget': {
				const label = editor.entityLabel === null || editor.componentLabel === null
					? null : `${editor.entityLabel} · ${editor.componentLabel}`;
				container.textContent = semanticLabel(label, editor.resolution);
				return;
			}
			case 'collectionSummary':
				container.textContent = editor.count === null ? '—' : strings.items.replace('{count}', String(editor.count));
				return;
			case 'objectSummary':
				container.textContent = editor.count === null ? '—' : strings.fields.replace('{count}', String(editor.count));
				return;
			case 'fallback':
				container.textContent = editor.value === 'null' ? 'null' : '—';
		}
	}

	function propertyBadges(property: InspectorPresentationProperty): readonly { text: string; problem?: boolean }[] {
		const badges: { text: string; problem?: boolean }[] = [];
		if (property.state.origin === 'unset') {
			badges.push({ text: property.required ? strings.required : strings.unset, problem: property.required });
		}
		if (property.state.validity === 'broken-reference') {
			badges.push({ text: strings.broken, problem: true });
		}
		if (property.state.validity === 'metadata-unavailable') {
			badges.push({ text: strings.metadataUnavailable });
		}
		return badges;
	}

	function renderProperty(groupId: string, property: InspectorPresentationProperty): InspectorWebviewElement {
		const row = element('div', 'property');
		row.tabIndex = -1;
		row.dataset.propertyId = property.identity;
		row.dataset.editorKind = property.propertyEditor.kind;
		if (property.state.modified) {
			row.classList.add('modified');
			row.title = strings.modified;
		}
		const label = element('div', 'property-label', property.label);
		if (property.description !== null) {
			label.title = property.description;
		}
		const value = element('div', 'property-value');
		renderPropertyEditor(value, property.propertyEditor, groupId, property.identity);
		row.append(label, value);
		const badges = propertyBadges(property);
		if (badges.length > 0) {
			const box = element('div', 'badges');
			for (const badge of badges) {
				box.append(element('span', `badge${badge.problem ? ' problem' : ''}`, badge.text));
			}
			row.append(box);
		}
		return row;
	}

	return { renderProperty, renderPropertyEditor };
}
