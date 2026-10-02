/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthoredDefinitionState, HierarchySelection } from '../definition/authoredDefinitionState';
import {
	HierarchySemanticTargetDto,
	InspectorReadResultDto,
	InspectorSnapshotDto,
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

/** Owns Inspector reads and focused-group state while Hierarchy remains selection authority. */
export class InspectorState {
	private readonly listeners = new Set<() => void>();
	private readonly definitionSubscription: { dispose(): void };
	private value: InspectorStateSnapshot = { status: 'empty' };
	private requestToken = 0;
	private disposed = false;

	constructor(
		private readonly reader: InspectorReader,
		private readonly definitions: AuthoredDefinitionState
	) {
		this.definitionSubscription = definitions.onDidChange(() => this.refresh());
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
		this.listeners.clear();
		this.value = { status: 'empty' };
	}

	private refresh(): void {
		const token = ++this.requestToken;
		const selection = this.definitions.selection;
		const active = this.definitions.active;
		if (selection === undefined || active === undefined || active.assetId !== selection.assetId) {
			this.set({ status: 'empty' });
			return;
		}

		const previous = this.definitions.selectedInspectorGroupId;
		this.set({ status: 'loading', selection });
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

function arrayEquals(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
	return left === undefined || right === undefined
		? left === right
		: left.length === right.length && left.every((value, index) => value === right[index]);
}
