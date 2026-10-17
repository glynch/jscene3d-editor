/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InspectorWebviewDocumentMessage, InspectorWebviewToHostMessage } from './inspectorWebviewProtocol';

/** Browser event subset used by the Inspector's dependency-free renderer. */
export interface InspectorWebviewElementEvent {
	readonly target: InspectorWebviewElement;
	readonly key?: string;
	readonly data?: string | null;
	readonly inputType?: string;
	readonly isComposing?: boolean;
	preventDefault(): void;
}

/** DOM element subset needed by the Inspector renderer and its focused tests. */
export interface InspectorWebviewElement {
	readonly dataset: Record<string, string | undefined>;
	readonly classList: {
		add(...classNames: string[]): void;
		toggle(className: string, force?: boolean): boolean;
	};
	className: string;
	textContent: string;
	innerHTML: string;
	title: string;
	type: string;
	inputMode: string;
	value: string;
	hidden: boolean;
	disabled: boolean;
	checked: boolean;
	open: boolean;
	tabIndex: number;
	selectionStart: number | null;
	selectionEnd: number | null;
	selectionDirection: 'forward' | 'backward' | 'none' | null;
	append(...children: readonly InspectorWebviewElement[]): void;
	replaceChildren(...children: readonly InspectorWebviewElement[]): void;
	setAttribute(name: string, value: string): void;
	setSelectionRange(start: number, end: number, direction?: 'forward' | 'backward' | 'none'): void;
	addEventListener(type: string, listener: (event: InspectorWebviewElementEvent) => void): void;
	closest(selector: string): InspectorWebviewElement | null;
	focus(): void;
	scrollIntoView(options?: { readonly block?: string }): void;
}

/** Browser document subset needed by the Inspector renderer. */
export interface InspectorWebviewDocument {
	getElementById(id: string): InspectorWebviewElement | null;
	createElement(tagName: string): InspectorWebviewElement;
}

/** Persistent state and message bridge supplied by Code OSS to the Inspector webview. */
export interface InspectorWebviewHost {
	postMessage(message: InspectorWebviewDocumentMessage): void;
	getState(): unknown;
	setState(state: object): void;
}

/** Identified transport exposed by Code OSS to one Inspector browser document. */
export interface InspectorWebviewBridge {
	postMessage(message: InspectorWebviewToHostMessage): void;
	getState(): unknown;
	setState(state: object): void;
}

/** Browser dependencies supplied to the Inspector renderer at document startup. */
export interface InspectorWebviewEnvironment {
	readonly document: InspectorWebviewDocument;
	readonly host: InspectorWebviewBridge;
	readonly addHostMessageListener: (listener: (message: unknown) => void) => void;
}

/** Creates a DOM element and applies the Inspector's common class/text initialization. */
export type InspectorElementFactory = (
	tagName: string,
	className?: string,
	text?: string
) => InspectorWebviewElement;
