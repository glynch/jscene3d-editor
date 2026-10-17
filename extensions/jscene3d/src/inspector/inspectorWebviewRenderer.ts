/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InspectorPresentation, InspectorPresentationGroup } from './inspectorPresentation';
import type { InspectorHostToWebviewMessage } from './inspectorWebviewProtocol';
import type { InspectorWebviewElement, InspectorWebviewEnvironment } from './inspectorWebviewDom';
import { createInspectorPropertyRenderer, type PendingNumericEditor } from './inspectorWebviewPropertyRenderer';

export type {
	InspectorWebviewElement,
	InspectorWebviewElementEvent,
	InspectorWebviewEnvironment,
	InspectorWebviewHost,
	InspectorWebviewBridge
} from './inspectorWebviewDom';

/** Runs the persistent, dependency-free Inspector browser renderer. */
export function runInspectorWebview(
	documentId: string,
	environment: InspectorWebviewEnvironment
): void {
	const document = environment.document;
	const bridge = environment.host;
	const host = {
		postMessage: (message: import('./inspectorWebviewProtocol').InspectorWebviewDocumentMessage): void => {
			bridge.postMessage({ ...message, documentId });
		},
		getState: (): unknown => bridge.getState(),
		setState: (state: object): void => bridge.setState(state)
	};
	const root = document.getElementById('app');
	if (root === null) {
		throw new Error('Inspector webview root is unavailable');
	}
	const app = root;
	let acceptPresentationMessage = (_message: InspectorHostToWebviewMessage): void => undefined;

	function element(tagName: string, className?: string, text?: string): InspectorWebviewElement {
		const result = document.createElement(tagName);
		if (className !== undefined) {
			result.className = className;
		}
		if (text !== undefined) {
			result.textContent = text;
		}
		return result;
	}

	function renderMessage(presentation: Exclude<InspectorPresentation, { readonly status: 'ready' }>): void {
		const content = element('div', 'message-content');
		const icon = element('div', 'message-icon');
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML = '<svg viewBox="0 0 32 32"><path d="M16 3 27 9.3v13.4L16 29 5 22.7V9.3L16 3Z M5.5 9.6 16 16l10.5-6.4M16 16v13"></path></svg>';
		const title = element('h2', 'message-title');
		const detail = element('p', 'message-detail');
		if (presentation.status === 'empty') {
			title.textContent = presentation.strings.empty;
			detail.textContent = presentation.strings.emptyDetail;
		} else {
			title.textContent = presentation.status === 'loading'
				? presentation.strings.loading : presentation.strings.rejected;
		}
		content.append(icon, title, detail);
		const shell = element('section', 'message-shell');
		shell.append(content);
		app.replaceChildren(shell);
		acceptPresentationMessage = message => {
			if (message.type === 'prepareForDocumentClose') {
				host.postMessage({ type: 'prepareForDocumentCloseResult', requestId: message.requestId, accepted: true });
			}
		};
	}

	function componentIcon(group: InspectorPresentationGroup): string {
		const key = `${group.componentType?.id ?? ''} ${group.label}`.toLocaleLowerCase();
		if (key.includes('transform')) {
			return '<svg viewBox="0 0 20 20"><path d="M10 2v16M2 10h16M10 2 8 4m2-2 2 2M18 10l-2-2m2 2-2 2"></path></svg>';
		}
		if (key.includes('collider') || key.includes('collision')) {
			return '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"></rect><path d="M6 3v14M14 3v14M3 6h14M3 14h14"></path></svg>';
		}
		if (key.includes('light')) {
			return '<svg viewBox="0 0 20 20"><circle cx="10" cy="8" r="4"></circle><path d="M8 13h4m-3 3h2M10 1v2M3.6 3.6 5 5m10-1.4L13.6 5M2 9h2m12 0h2"></path></svg>';
		}
		if (key.includes('script')) {
			return '<svg viewBox="0 0 20 20"><path d="M6 2h6l4 4v12H6V2Zm6 0v4h4M9 10h4m-4 3h4"></path></svg>';
		}
		return '<svg viewBox="0 0 20 20"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Zm-7 4 7 4 7-4m-7 4v8"></path></svg>';
	}

	function renderReady(presentation: Extract<InspectorPresentation, { readonly status: 'ready' }>): void {
		const { snapshot, strings } = presentation;
		const savedState = host.getState() as { readonly collapsedGroups?: unknown } | undefined;
		const collapsedGroups = new Set(Array.isArray(savedState?.collapsedGroups)
			? savedState.collapsedGroups.filter((value): value is string => typeof value === 'string') : []);
		const pendingNumericEditors = new Set<PendingNumericEditor>();
		const componentCards = new Map<string, InspectorWebviewElement>();
		let selectedGroupId = presentation.selectedGroupId;
		const propertyRenderer = createInspectorPropertyRenderer({
			host, strings, element, pendingNumericEditors
		});

		function collapseKey(groupId: string): string {
			const occurrence = snapshot.target.occurrence;
			return JSON.stringify([
				snapshot.target.kind, snapshot.target.source, snapshot.target.identity,
				occurrence?.definitionAssetId ?? null, occurrence?.entityPath ?? null, groupId
			]);
		}

		function selectGroup(groupId: string, notify = true): void {
			if (!snapshot.groups.some(group => group.identity === groupId)) {
				return;
			}
			selectedGroupId = groupId;
			if (notify) {
				host.postMessage({ type: 'selectGroup', groupId });
			}
		}

		function renderComponent(group: InspectorPresentationGroup): InspectorWebviewElement {
			const card = element('details', 'component-card');
			card.dataset.groupId = group.identity;
			const key = collapseKey(group.identity);
			card.open = !collapsedGroups.has(key);
			componentCards.set(group.identity, card);
			const header = element('summary', 'component-header');
			const disclosure = element('span', 'component-disclosure', '▾');
			disclosure.setAttribute('aria-hidden', 'true');
			const icon = element('span', 'component-icon');
			icon.setAttribute('aria-hidden', 'true');
			icon.innerHTML = componentIcon(group);
			const label = element('span', 'component-name', group.label);
			label.title = group.description ?? group.label;
			const actions = element('span', 'component-actions');
			for (const [name, glyph] of [
				[strings.componentHelp, '?'], [strings.componentSettings, '☷'], [strings.componentActions, '⋯']
			] as const) {
				const button = element('button', 'component-action', glyph);
				button.type = 'button';
				button.disabled = true;
				button.setAttribute('aria-label', name);
				button.setAttribute('title', strings.deferred);
				actions.append(button);
			}
			header.append(disclosure, icon, label, actions);
			card.append(header);
			const body = element('div', 'component-body');
			if (group.metadataStatus === 'unavailable') {
				body.append(element('p', 'component-warning', strings.metadataUnavailable));
			}
			for (const property of group.properties) {
				body.append(propertyRenderer.renderProperty(group.identity, property));
			}
			card.append(body);
			header.addEventListener('click', event => {
				if (event.target.closest('button') !== null) {
					event.preventDefault();
					return;
				}
				selectGroup(group.identity);
			});
			card.addEventListener('toggle', () => {
				if (card.open) {
					collapsedGroups.delete(key);
				} else {
					collapsedGroups.add(key);
				}
				host.setState({ collapsedGroups: Array.from(collapsedGroups) });
			});
			return card;
		}

		const shell = element('section', 'inspector-shell');
		const toolbar = element('header', 'inspector-toolbar');
		const readonlyStatus = element('span', 'inspector-readonly', strings.readOnly);
		readonlyStatus.hidden = snapshot.editable;
		const menu = element('button', 'inspector-menu', '⋯');
		menu.type = 'button';
		menu.disabled = true;
		menu.setAttribute('aria-label', strings.componentActions);
		menu.setAttribute('title', strings.deferred);
		toolbar.append(element('div', 'inspector-title', strings.inspector), readonlyStatus, menu);
		const scroll = element('div', 'inspector-scroll');
		const entityCard = element('section', 'entity-card');
		const entityPrimary = element('div', 'entity-primary');
		const entityIcon = element('span', 'entity-icon');
		entityIcon.setAttribute('aria-hidden', 'true');
		entityIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="m12 2.5 8 4.6v9.8l-8 4.6-8-4.6V7.1l8-4.6Z M4.4 7.3 12 12l7.6-4.7M12 12v9.5"></path></svg>';
		const enabledControl = element('span', 'entity-enabled');
		const nameInput = element('input', 'entity-name');
		nameInput.type = 'text';
		nameInput.value = snapshot.title;
		nameInput.setAttribute('readonly', '');
		nameInput.setAttribute('aria-label', strings.entityName);
		nameInput.setAttribute('title', strings.deferred);
		const staticLabel = element('label', 'check-label entity-static deferred-control');
		const staticCheckbox = element('input', 'deferred-checkbox');
		staticCheckbox.type = 'checkbox';
		staticCheckbox.disabled = true;
		staticLabel.append(staticCheckbox, element('span', undefined, strings.static));
		staticLabel.setAttribute('title', strings.deferred);
		entityPrimary.append(entityIcon, enabledControl, nameInput, staticLabel);
		const metadata = element('div', 'entity-metadata');
		for (const [label, value, className] of [
			[strings.tag, strings.untagged, 'tag'], [strings.layer, strings.defaultLayer, 'layer']
		] as const) {
			metadata.append(element('label', `metadata-label ${className}-label`, label));
			const select = element('select', `deferred-select ${className}-select`);
			select.disabled = true;
			select.setAttribute('title', strings.deferred);
			select.append(element('option', undefined, value));
			metadata.append(select);
		}
		entityCard.append(entityPrimary, metadata);
		const entityGroup = snapshot.groups.find(group => group.kind === 'entity' || group.kind === 'placement');
		const enabledProperty = entityGroup?.properties.find(property => property.identity === 'enabled');
		if (entityGroup !== undefined && enabledProperty?.propertyEditor.kind === 'boolean') {
			propertyRenderer.renderPropertyEditor(
				enabledControl, enabledProperty.propertyEditor, entityGroup.identity, enabledProperty.identity
			);
		} else {
			const checkbox = element('input', 'property-checkbox');
			checkbox.type = 'checkbox';
			checkbox.disabled = true;
			enabledControl.append(checkbox);
		}
		enabledControl.setAttribute('title', strings.enabled);
		const componentStack = element('section', 'component-stack');
		for (const group of snapshot.groups.filter(candidate => candidate.kind === 'component')) {
			componentStack.append(renderComponent(group));
		}
		const addComponent = element('button', 'add-component', strings.addComponent);
		addComponent.type = 'button';
		addComponent.disabled = true;
		addComponent.setAttribute('title', strings.deferred);
		scroll.append(entityCard, componentStack, addComponent);
		shell.append(toolbar, scroll);
		app.replaceChildren(shell);

		acceptPresentationMessage = message => {
			if (message.type === 'focusGroup' && message.groupId !== selectedGroupId) {
				selectGroup(message.groupId, false);
				const card = componentCards.get(message.groupId);
				if (card !== undefined) {
					card.open = true;
					card.scrollIntoView({ block: 'nearest' });
				}
				return;
			}
			if (message.type === 'prepareForDocumentClose') {
				let accepted = true;
				for (const editor of Array.from(pendingNumericEditors)) {
					if (!editor.commit()) {
						editor.focus();
						accepted = false;
						break;
					}
				}
				host.postMessage({ type: 'prepareForDocumentCloseResult', requestId: message.requestId, accepted });
			}
		};
		if (selectedGroupId !== entityGroup?.identity) {
			const selectedCard = componentCards.get(selectedGroupId);
			if (selectedCard !== undefined) {
				selectedCard.open = true;
			}
		}
	}

	function render(presentation: InspectorPresentation): void {
		if (presentation.status === 'ready') {
			renderReady(presentation);
		} else {
			renderMessage(presentation);
		}
	}

	environment.addHostMessageListener(message => {
		if (typeof message !== 'object' || message === null) {
			return;
		}
		const candidate = message as Partial<InspectorHostToWebviewMessage>;
		if (candidate.documentId !== documentId) {
			return;
		}
		if (candidate.type === 'render' && Number.isSafeInteger(candidate.deliveryId)
			&& typeof candidate.bootstrap === 'object' && candidate.bootstrap !== null) {
			render(candidate.bootstrap as InspectorPresentation);
			host.postMessage({ type: 'presentationApplied', deliveryId: candidate.deliveryId! });
			return;
		}
		if (candidate.type === 'focusGroup' && Number.isSafeInteger(candidate.deliveryId)
			&& typeof candidate.groupId === 'string') {
			acceptPresentationMessage(candidate as InspectorHostToWebviewMessage);
			host.postMessage({ type: 'presentationApplied', deliveryId: candidate.deliveryId! });
			return;
		}
		if (candidate.type === 'prepareForDocumentClose' && Number.isSafeInteger(candidate.requestId)) {
			acceptPresentationMessage(candidate as InspectorHostToWebviewMessage);
		}
	});
	host.postMessage({ type: 'ready' });
}
