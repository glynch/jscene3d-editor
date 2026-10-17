/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DefinitionMutationValueDto } from '../protocol/authoringProtocol';
import type { InspectorPresentation } from './inspectorPresentation';

/** Browser actions emitted after the Inspector document has attached its lifecycle identity. */
export type InspectorWebviewDocumentMessage =
	| { readonly type: 'ready' }
	| { readonly type: 'presentationApplied'; readonly deliveryId: number }
	| { readonly type: 'selectGroup'; readonly groupId: string }
	| { readonly type: 'prepareForDocumentCloseResult'; readonly requestId: number; readonly accepted: boolean }
	| {
		readonly type: 'editProperty'; readonly groupId: string; readonly propertyId: string;
		readonly candidate: DefinitionMutationValueDto;
	};

/** Messages accepted from an identified, untrusted Inspector webview document. */
export type InspectorWebviewToHostMessage = InspectorWebviewDocumentMessage & { readonly documentId: string };

/** Messages delivered by the Inspector host to its webview document. */
export type InspectorHostToWebviewMessage =
	| {
		readonly type: 'focusGroup'; readonly documentId: string; readonly deliveryId: number;
		readonly groupId: string;
	}
	| {
		readonly type: 'render'; readonly documentId: string; readonly deliveryId: number;
		readonly bootstrap: InspectorPresentation;
	}
	| { readonly type: 'prepareForDocumentClose'; readonly documentId: string; readonly requestId: number };

/** Validates the exact closed message vocabulary accepted from the Inspector webview. */
export function isInspectorWebviewMessage(value: unknown): value is InspectorWebviewToHostMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const message = value as Record<string, unknown>;
	if (typeof message.documentId !== 'string' || message.documentId.length === 0) {
		return false;
	}
	if (message.type === 'ready') {
		return exactKeys(message, 'type', 'documentId');
	}
	if (message.type === 'presentationApplied') {
		return positiveInteger(message.deliveryId)
			&& exactKeys(message, 'type', 'documentId', 'deliveryId');
	}
	if (message.type === 'selectGroup') {
		return typeof message.groupId === 'string'
			&& message.groupId.length > 0
			&& exactKeys(message, 'type', 'documentId', 'groupId');
	}
	if (message.type === 'prepareForDocumentCloseResult') {
		return positiveInteger(message.requestId)
			&& typeof message.accepted === 'boolean'
			&& exactKeys(message, 'type', 'documentId', 'requestId', 'accepted');
	}
	return message.type === 'editProperty'
		&& typeof message.groupId === 'string' && message.groupId.length > 0
		&& typeof message.propertyId === 'string' && message.propertyId.length > 0
		&& isMutationCandidate(message.candidate)
		&& exactKeys(message, 'type', 'documentId', 'groupId', 'propertyId', 'candidate');
}

function positiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function exactKeys(value: Record<string, unknown>, ...keys: readonly string[]): boolean {
	return Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
}

function isMutationCandidate(value: unknown): value is DefinitionMutationValueDto {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (candidate.kind === 'boolean') {
		return typeof candidate.value === 'boolean'
			&& Object.keys(candidate).every(key => key === 'kind' || key === 'value');
	}
	if (candidate.kind === 'number-array') {
		return Array.isArray(candidate.literals)
			&& candidate.literals.every(literal => typeof literal === 'string')
			&& Object.keys(candidate).every(key => key === 'kind' || key === 'literals');
	}
	return (candidate.kind === 'integer' || candidate.kind === 'number' || candidate.kind === 'text')
		&& typeof candidate.literal === 'string'
		&& Object.keys(candidate).every(key => key === 'kind' || key === 'literal');
}
