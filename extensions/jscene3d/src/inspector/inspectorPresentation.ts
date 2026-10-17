/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InspectorPropertyDto, InspectorSnapshotDto, InspectorTargetGroupDto } from '../protocol/authoringProtocol';
import type { InspectorStateSnapshot } from './inspectorState';
import { type ReadonlyPropertyEditorModel, resolvePropertyEditor } from './propertyEditorResolver';

/** Localizes Inspector presentation text without coupling projection to VS Code. */
export type InspectorTranslate = (message: string, ...args: string[]) => string;

/** One validated property enriched for the built-in Inspector renderer. */
export type InspectorPresentationProperty = InspectorPropertyDto & {
	readonly propertyEditor: ReadonlyPropertyEditorModel;
};

/** One ordered Inspector group enriched for the built-in Inspector renderer. */
export type InspectorPresentationGroup = Omit<InspectorTargetGroupDto, 'properties'> & {
	readonly properties: readonly InspectorPresentationProperty[];
};

/** Immutable Java-issued Inspector snapshot enriched only with presentation data. */
export type InspectorPresentationSnapshot = Omit<InspectorSnapshotDto, 'groups'> & {
	readonly groups: readonly InspectorPresentationGroup[];
};

/** Localized text consumed by the built-in Inspector renderer. */
export interface InspectorPresentationStrings {
	readonly inspector: string;
	readonly empty: string;
	readonly emptyDetail: string;
	readonly loading: string;
	readonly rejected: string;
	readonly readOnly: string;
	readonly entityName: string;
	readonly enabled: string;
	readonly static: string;
	readonly tag: string;
	readonly untagged: string;
	readonly layer: string;
	readonly defaultLayer: string;
	readonly deferred: string;
	readonly componentHelp: string;
	readonly componentSettings: string;
	readonly componentActions: string;
	readonly addComponent: string;
	readonly chooseResource: string;
	readonly unset: string;
	readonly required: string;
	readonly broken: string;
	readonly metadataUnavailable: string;
	readonly resolved: string;
	readonly trueValue: string;
	readonly falseValue: string;
	readonly invalidInteger: string;
	readonly invalidNumber: string;
	readonly modified: string;
	readonly items: string;
	readonly fields: string;
}

/** Presentation payload consumed by the persistent Inspector webview document. */
export type InspectorPresentation =
	| { readonly status: 'empty' | 'loading'; readonly strings: InspectorPresentationStrings }
	| {
		readonly status: 'rejected'; readonly failureCode: string;
		readonly strings: InspectorPresentationStrings;
	}
	| {
		readonly status: 'ready'; readonly snapshot: InspectorPresentationSnapshot;
		readonly selectedGroupId: string; readonly strings: InspectorPresentationStrings;
	};

/** Projects current Inspector state into immutable built-in presentation data. */
export function createInspectorPresentation(
	state: InspectorStateSnapshot,
	translate: InspectorTranslate
): InspectorPresentation {
	const strings = presentationStrings(translate);
	return state.status === 'ready'
		? {
			status: state.status,
			snapshot: createInspectorPresentationSnapshot(state.inspector),
			selectedGroupId: state.selectedGroupId,
			strings
		}
		: state.status === 'rejected'
			? { status: state.status, failureCode: state.failureCode, strings }
			: { status: state.status, strings };
}

/** Enriches one validated Inspector snapshot without changing its authoritative data. */
export function createInspectorPresentationSnapshot(snapshot: InspectorSnapshotDto): InspectorPresentationSnapshot {
	return {
		...snapshot,
		groups: snapshot.groups.map(group => ({
			...group,
			properties: group.properties.map(property => ({
				...property,
				propertyEditor: resolvePropertyEditor(property)
			}))
		}))
	};
}

function presentationStrings(translate: InspectorTranslate): InspectorPresentationStrings {
	return {
		inspector: translate('Inspector'),
		empty: translate('No entity selected'),
		emptyDetail: translate('Select an entity in the Hierarchy or Scene View to inspect its components.'),
		loading: translate('Loading Inspector…'),
		rejected: translate('Inspector data is unavailable.'),
		readOnly: translate('Read-only'),
		entityName: translate('Entity name'),
		enabled: translate('Enabled'),
		static: translate('Static'),
		tag: translate('Tag'),
		untagged: translate('Untagged'),
		layer: translate('Layer'),
		defaultLayer: translate('Default'),
		deferred: translate('Not available yet'),
		componentHelp: translate('Component help'),
		componentSettings: translate('Component settings'),
		componentActions: translate('Component actions'),
		addComponent: translate('Add Component'),
		chooseResource: translate('Choose resource'),
		unset: translate('Unset'),
		required: translate('Required'),
		broken: translate('Broken reference'),
		metadataUnavailable: translate('Descriptor metadata unavailable'),
		resolved: translate('Resolved'),
		trueValue: translate('True'),
		falseValue: translate('False'),
		invalidInteger: translate('Invalid integer'),
		invalidNumber: translate('Invalid number'),
		modified: translate('Modified since last save'),
		items: translate('{0} items', '{count}'),
		fields: translate('{0} fields', '{count}')
	};
}
