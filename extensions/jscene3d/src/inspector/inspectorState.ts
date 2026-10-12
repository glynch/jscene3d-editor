/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoredDefinitionPreview, AuthoredDefinitionState, HierarchySelection } from '../definition/authoredDefinitionState';
import {
	DefinitionMutationValueDto,
	HierarchySemanticTargetDto,
	InspectorMutationTargetDto,
	InspectorReadResultDto,
	InspectorSnapshotDto,
	InspectorValueDto,
	ProjectDiagnosticDto
} from '../protocol/authoringProtocol';

export interface InspectorReader {
	readInspector(
		expectedProjectGeneration: number,
		expectedDefinitionRevision: number,
		target: HierarchySemanticTargetDto
	): Promise<InspectorReadResultDto>;
}

export type InspectorStateSnapshot =
	| { readonly status: 'empty' }
	| { readonly status: 'loading'; readonly selection: HierarchySelection }
	| {
		readonly status: 'rejected'; readonly selection: HierarchySelection;
		readonly failureCode: string; readonly diagnostics: readonly ProjectDiagnosticDto[];
	}
	| {
		readonly status: 'ready'; readonly selection: HierarchySelection;
		readonly inspector: InspectorSnapshotDto; readonly selectedGroupId: string;
	};

/** Owns Inspector reads and focused-group state while authored-definition state owns selection. */
export class InspectorState {
	private readonly listeners = new Set<() => void>();
	private readonly definitionSubscription: { dispose(): void };
	private readonly previewSubscription: { dispose(): void };
	private value: InspectorStateSnapshot = { status: 'empty' };
	private requestToken = 0;
	private disposed = false;

	constructor(
		private readonly reader: InspectorReader,
		private readonly definitions: AuthoredDefinitionState
	) {
		this.definitionSubscription = definitions.onDidChange(change => this.refresh(change !== 'snapshot'));
		this.previewSubscription = definitions.onDidPreview(preview => this.acceptPreview(preview));
		this.refresh();
	}

	get snapshot(): InspectorStateSnapshot {
		return this.value;
	}

	onDidChange(listener: () => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	selectGroup(identity: string): void {
		const current = this.value;
		if (current.status !== 'ready' || current.selectedGroupId === identity) {
			return;
		}
		if (!current.inspector.groups.some(group => group.identity === identity)) {
			throw new Error('Inspector group does not belong to the current snapshot');
		}
		this.definitions.rememberInspectorGroup(identity);
		this.value = { ...current, selectedGroupId: identity };
		this.emit();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.requestToken++;
		this.definitionSubscription.dispose();
		this.previewSubscription.dispose();
		this.listeners.clear();
		this.value = { status: 'empty' };
	}

	private refresh(showLoading = true): void {
		const token = ++this.requestToken;
		const selection = this.definitions.selection;
		const active = this.definitions.active;
		if (selection === undefined || active === undefined || active.assetId !== selection.assetId) {
			this.set({ status: 'empty' });
			return;
		}

		const previous = this.definitions.selectedInspectorGroupId;
		const retainReady = !showLoading
			&& this.value.status === 'ready'
			&& sameSelection(this.value.selection, selection);
		if (!retainReady) {
			this.set({ status: 'loading', selection });
		}
		void this.reader.readInspector(selection.projectGeneration, active.snapshot.revision, selection.target)
			.then(result => this.accept(token, selection, active.snapshot.revision, previous, result))
			.catch(() => {
				if (this.current(token, selection)) {
					this.set({
						status: 'rejected', selection,
						failureCode: 'authoring.inspector.requestFailed', diagnostics: []
					});
				}
			});
	}

	private acceptPreview(preview: AuthoredDefinitionPreview): void {
		const current = this.value;
		if (current.status !== 'ready' || current.selection.assetId !== preview.target.occurrence.definitionAssetId
			|| !sameMutationTarget(current.selection.target, preview.target)) {
			return;
		}
		const inspector = {
			...current.inspector,
			revision: preview.revision,
			groups: current.inspector.groups.map(group => ({
				...group,
				properties: group.properties.map(property => sameInspectorMutationTarget(property.mutationTarget, preview.target)
					? {
						...property,
						state: {
							...property.state,
							authoredValue: inspectorValue(preview.value),
							effectiveValue: inspectorValue(preview.value),
							origin: 'authored' as const,
							validity: 'valid' as const
						}
					} : property)
			}))
		};
		this.set({ ...current, inspector });
	}

	private accept(
		token: number,
		selection: HierarchySelection,
		expectedRevision: number,
		previousGroupId: string | undefined,
		result: InspectorReadResultDto
	): void {
		if (!this.current(token, selection)) {
			return;
		}
		if (!result.read) {
			this.set({
				status: 'rejected', selection,
				failureCode: result.failureCode, diagnostics: result.diagnostics
			});
			return;
		}
		if (result.projectGeneration !== selection.projectGeneration
			|| result.snapshot.revision !== expectedRevision
			|| !sameTarget(result.snapshot.target, selection.target)) {
			this.set({
				status: 'rejected', selection,
				failureCode: 'authoring.inspector.staleResponse', diagnostics: []
			});
			return;
		}
		const selectedGroupId = previousGroupId !== undefined
			&& result.snapshot.groups.some(group => group.identity === previousGroupId)
			? previousGroupId
			: result.snapshot.groups.find(group => group.kind === 'entity')?.identity
				?? result.snapshot.groups.find(group => group.kind === 'placement')?.identity
				?? result.snapshot.groups[0]?.identity;
		if (selectedGroupId === undefined) {
			this.set({
				status: 'rejected', selection,
				failureCode: 'authoring.inspector.emptySnapshot', diagnostics: []
			});
			return;
		}
		this.definitions.rememberInspectorGroup(selectedGroupId);
		this.set({ status: 'ready', selection, inspector: result.snapshot, selectedGroupId });
	}

	private current(token: number, selection: HierarchySelection): boolean {
		return !this.disposed
			&& token === this.requestToken
			&& this.definitions.selection === selection;
	}

	private set(value: InspectorStateSnapshot): void {
		if (this.disposed) {
			return;
		}
		this.value = value;
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

/** Compares all redundant Java-issued target identity fields. */
function sameTarget(left: HierarchySemanticTargetDto, right: HierarchySemanticTargetDto): boolean {
	return left.kind === right.kind
		&& left.source === right.source
		&& left.identity === right.identity
		&& left.occurrence?.definitionAssetId === right.occurrence?.definitionAssetId
		&& arrayEquals(left.occurrence?.entityPath, right.occurrence?.entityPath);
}

function sameSelection(left: HierarchySelection, right: HierarchySelection): boolean {
	return left.projectGeneration === right.projectGeneration
		&& left.assetId === right.assetId
		&& sameTarget(left.target, right.target);
}

function sameMutationTarget(selection: HierarchySemanticTargetDto, target: InspectorMutationTargetDto): boolean {
	return selection.identity === target.entityId
		&& selection.occurrence !== null
		&& selection.occurrence.definitionAssetId === target.occurrence.definitionAssetId
		&& arrayEquals(selection.occurrence.entityPath, target.occurrence.entityPath);
}

function sameInspectorMutationTarget(
	left: InspectorMutationTargetDto | null,
	right: InspectorMutationTargetDto
): boolean {
	return left?.kind === 'component-property' && right.kind === 'component-property'
		&& left.entityId === right.entityId && left.componentId === right.componentId && left.propertyId === right.propertyId
		&& left.occurrence.definitionAssetId === right.occurrence.definitionAssetId
		&& arrayEquals(left.occurrence.entityPath, right.occurrence.entityPath);
}

function inspectorValue(value: DefinitionMutationValueDto): InspectorValueDto {
	switch (value.kind) {
		case 'boolean':
			return { kind: 'boolean', value: value.value };
		case 'integer':
		case 'number':
			return { kind: 'number', decimal: value.literal };
		case 'text':
			return { kind: 'text', value: value.literal };
		case 'number-array':
			return { kind: 'array', values: value.literals.map(decimal => ({ kind: 'number', decimal })) };
	}
}

function arrayEquals(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
	return left === undefined || right === undefined
		? left === right
		: left.length === right.length && left.every((value, index) => value === right[index]);
}
