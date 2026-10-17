/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DefinitionMutationOutcome } from '../definition/authoredDefinitionLifecycle';
import type { AuthoredDefinitionResource, HierarchySelection } from '../definition/authoredDefinitionState';
import type {
	DefinitionMutationDto,
	DefinitionMutationValueDto,
	HierarchyOccurrenceDto,
	HierarchySemanticTargetDto,
	InspectorMutationTargetDto,
	InspectorPropertyDto,
	InspectorSnapshotDto,
	InspectorTargetGroupDto
} from '../protocol/authoringProtocol';
import type { InspectorStateSnapshot } from './inspectorState';
import { acceptsPropertyEditorCandidate } from './propertyEditorResolver';

/** One presentation-independent Inspector property edit request. */
export interface InspectorEditRequest {
	readonly groupId: string;
	readonly propertyId: string;
	readonly candidate: DefinitionMutationValueDto;
}

/** Current Inspector projection consumed without transferring snapshot ownership. */
export interface InspectorEditState {
	readonly snapshot: InspectorStateSnapshot;
}

/** Current authored-definition identity required to authorize an Inspector edit. */
export interface InspectorEditContext {
	readonly active: AuthoredDefinitionResource | undefined;
	readonly selection: HierarchySelection | undefined;
}

/** Existing Java-authoritative mutation boundary used by Inspector edits. */
export interface InspectorDefinitionEditor {
	acceptInspectorMutation(
		target: InspectorMutationTargetDto,
		mutation: DefinitionMutationDto,
		label: string
	): Promise<DefinitionMutationOutcome>;
}

/** User-facing mutation outcome reporting supplied by the VS Code integration boundary. */
export interface InspectorEditFeedback {
	rejected(label: string, reason: string): Promise<void>;
	failed(error: unknown): Promise<void>;
}

/** Requests re-delivery only while the presentation still represents the inspected snapshot. */
export type InspectorPresentationRefresh = (expectedInspector: InspectorSnapshotDto | undefined) => void;

/** Authorizes and coordinates Inspector property edits without owning authoring or presentation state. */
export class InspectorEditCoordinator {
	private disposed = false;

	constructor(
		private readonly state: InspectorEditState,
		private readonly context: InspectorEditContext,
		private readonly editor: InspectorDefinitionEditor,
		private readonly feedback: InspectorEditFeedback
	) { }

	async edit(request: InspectorEditRequest, refreshPresentation: InspectorPresentationRefresh): Promise<void> {
		if (this.disposed) {
			return;
		}
		const snapshot = this.state.snapshot;
		const expectedInspector = snapshot.status === 'ready' ? snapshot.inspector : undefined;
		const property = this.resolveProperty(snapshot, request);
		if (property === undefined || property.mutationTarget === null) {
			refreshPresentation(expectedInspector);
			return;
		}

		const label = `Edit ${property.label}`;
		try {
			const outcome = await this.editor.acceptInspectorMutation(
				property.mutationTarget, { operation: 'set', value: request.candidate }, label);
			if (!this.disposed && outcome.status === 'rejected') {
				await this.feedback.rejected(label, outcome.diagnostics[0]?.message ?? outcome.outcome);
			}
		} catch (error) {
			if (!this.disposed) {
				await this.reportFailure(error);
			}
		} finally {
			if (!this.disposed) {
				refreshPresentation(expectedInspector);
			}
		}
	}

	dispose(): void {
		this.disposed = true;
	}

	private async reportFailure(error: unknown): Promise<void> {
		try {
			await this.feedback.failed(error);
		} catch {
			// The mutation is already settled; a failing notification must not create an unhandled rejection.
		}
	}

	private resolveProperty(
		snapshot: InspectorStateSnapshot,
		request: InspectorEditRequest
	): InspectorPropertyDto | undefined {
		if (snapshot.status !== 'ready' || !this.current(snapshot)) {
			return undefined;
		}
		const group = snapshot.inspector.groups.find(candidate => candidate.identity === request.groupId);
		const property = group?.properties.find(candidate => candidate.identity === request.propertyId);
		if (group === undefined || property === undefined
			|| !snapshot.inspector.editable || !group.editable || !property.state.editable
			|| property.mutationTarget === null
			|| !validMutationTarget(snapshot.selection, group, property)
			|| !acceptsPropertyEditorCandidate(property, request.candidate)) {
			return undefined;
		}
		return property;
	}

	private current(snapshot: Extract<InspectorStateSnapshot, { readonly status: 'ready' }>): boolean {
		const active = this.context.active;
		const selection = this.context.selection;
		return active !== undefined && selection !== undefined
			&& active.projectGeneration === snapshot.selection.projectGeneration
			&& active.assetId === snapshot.selection.assetId
			&& active.snapshot.revision === snapshot.inspector.revision
			&& sameSelection(selection, snapshot.selection)
			&& sameSemanticTarget(snapshot.inspector.target, snapshot.selection.target);
	}
}

function validMutationTarget(
	selection: HierarchySelection,
	group: InspectorTargetGroupDto,
	property: InspectorPropertyDto
): boolean {
	const target = property.mutationTarget;
	if (target === null || target.entityId !== selection.target.identity
		|| target.occurrence.definitionAssetId !== selection.assetId
		|| !sameOccurrence(target.occurrence, selection.occurrence)) {
		return false;
	}
	if (target.kind === 'entity-enabled') {
		return (group.kind === 'entity' || group.kind === 'placement')
			&& group.componentId === null && property.identity === 'enabled';
	}
	return group.kind === 'component'
		&& group.componentId === target.componentId
		&& property.identity === target.propertyId;
}

function sameSelection(left: HierarchySelection, right: HierarchySelection): boolean {
	return left.projectGeneration === right.projectGeneration
		&& left.assetId === right.assetId
		&& sameOccurrence(left.occurrence, right.occurrence)
		&& sameSemanticTarget(left.target, right.target);
}

function sameSemanticTarget(left: HierarchySemanticTargetDto, right: HierarchySemanticTargetDto): boolean {
	return left.kind === right.kind
		&& left.source === right.source
		&& left.identity === right.identity
		&& sameOptionalOccurrence(left.occurrence, right.occurrence);
}

function sameOptionalOccurrence(
	left: HierarchyOccurrenceDto | null,
	right: HierarchyOccurrenceDto | null
): boolean {
	return left === null || right === null ? left === right : sameOccurrence(left, right);
}

function sameOccurrence(left: HierarchyOccurrenceDto, right: HierarchyOccurrenceDto): boolean {
	return left.definitionAssetId === right.definitionAssetId
		&& left.entityPath.length === right.entityPath.length
		&& left.entityPath.every((identity, index) => identity === right.entityPath[index]);
}
