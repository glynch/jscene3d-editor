/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefinitionSnapshotDto, HierarchyNodeDto, HierarchyOccurrenceDto, HierarchySemanticTargetDto } from '../protocol/authoringProtocol';

/** One custom-editor resource mapped to authoritative generation-scoped JScene3D identity. */
export interface AuthoredDefinitionResource {
	readonly resource: string;
	readonly projectGeneration: number;
	readonly assetId: string;
	readonly snapshot: DefinitionSnapshotDto;
}

/** Extension-owned semantic selection for an Inspector consumer. */
export interface HierarchySelection {
	readonly projectGeneration: number;
	readonly assetId: string;
	readonly occurrence: HierarchyOccurrenceDto;
	readonly target: HierarchySemanticTargetDto;
}

/** Describes which supporting editor surface must react to an authored-definition state change. */
export type AuthoredDefinitionStateChange = 'project' | 'snapshot' | 'active' | 'selection';

interface RetainedHierarchySelection {
	readonly node: HierarchyNodeDto;
	readonly semantic: HierarchySelection;
}

interface RetainedInspectorContext {
	readonly target: HierarchySemanticTargetDto;
	readonly selectedGroupId: string;
}

interface AuthoredDefinitionContext {
	definition: AuthoredDefinitionResource;
	selection?: RetainedHierarchySelection;
	inspector?: RetainedInspectorContext;
}

/** Owns generation-scoped per-definition snapshots, selections, and supporting-view context. */
export class AuthoredDefinitionState {
	private readonly listeners = new Set<(change: AuthoredDefinitionStateChange) => void>();
	private readonly contexts = new Map<string, AuthoredDefinitionContext>();
	private projectGeneration: number | undefined;
	private activeResource: string | undefined;

	get active(): AuthoredDefinitionResource | undefined {
		return this.activeContext()?.definition;
	}

	get selection(): HierarchySelection | undefined {
		return this.activeContext()?.selection?.semantic;
	}

	/** Returns the current snapshot node corresponding to the active definition's retained selection. */
	get selectedNode(): HierarchyNodeDto | undefined {
		return this.activeContext()?.selection?.node;
	}

	/** Returns the retained Inspector group only when it belongs to the active semantic target. */
	get selectedInspectorGroupId(): string | undefined {
		const context = this.activeContext();
		return context?.selection !== undefined
			&& context.inspector !== undefined
			&& sameStableTarget(context.selection.semantic.target, context.inspector.target)
			? context.inspector.selectedGroupId
			: undefined;
	}

	/** Subscribes to context changes and identifies whether project, snapshot, activation, or selection changed. */
	onDidChange(listener: (change: AuthoredDefinitionStateChange) => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	setProjectGeneration(projectGeneration: number | undefined): void {
		if (projectGeneration === this.projectGeneration) {
			return;
		}
		this.projectGeneration = projectGeneration;
		this.contexts.clear();
		this.activeResource = undefined;
		this.emit('project');
	}

	register(resource: string, projectGeneration: number, snapshot: DefinitionSnapshotDto): AuthoredDefinitionResource {
		if (projectGeneration !== this.projectGeneration) {
			throw new Error('Definition resource does not belong to the active project generation');
		}
		const definition = {
			resource,
			projectGeneration,
			assetId: snapshot.context.assetId,
			snapshot
		};
		this.contexts.set(resource, { definition });
		return definition;
	}

	resolve(resource: string): AuthoredDefinitionResource | undefined {
		const context = this.contexts.get(resource);
		return context !== undefined && context.definition.projectGeneration === this.projectGeneration
			? context.definition
			: undefined;
	}

	resolveAsset(projectGeneration: number, assetId: string): AuthoredDefinitionResource | undefined {
		if (projectGeneration !== this.projectGeneration) {
			return undefined;
		}
		return Array.from(this.contexts.values())
			.map(context => context.definition)
			.find(definition => definition.assetId === assetId);
	}

	update(resource: string, snapshot: DefinitionSnapshotDto): AuthoredDefinitionResource {
		const context = this.contexts.get(resource);
		const current = this.resolve(resource);
		if (context === undefined || current === undefined || current.assetId !== snapshot.context.assetId) {
			throw new Error('Definition refresh does not belong to the active document identity');
		}
		const updated = { ...current, snapshot };
		context.definition = updated;
		if (context.selection !== undefined) {
			const node = findRetainedNode(snapshot.roots, context.selection.semantic);
			if (node === undefined) {
				context.selection = undefined;
				context.inspector = undefined;
			} else {
				context.selection = retainedSelection(updated, node);
			}
		}
		if (this.activeResource === resource) {
			this.emit('snapshot');
		}
		return updated;
	}

	activate(resource: string | undefined): void {
		const resolvedResource = resource !== undefined && this.resolve(resource) !== undefined ? resource : undefined;
		if (resolvedResource === this.activeResource) {
			return;
		}
		this.activeResource = resolvedResource;
		this.emit('active');
	}

	select(node: HierarchyNodeDto): void {
		const context = this.activeContext();
		const active = context?.definition;
		if (context === undefined || active === undefined || node.occurrence.definitionAssetId !== active.assetId) {
			throw new Error('Hierarchy selection does not belong to the active definition');
		}
		const currentNode = findRetainedNode(active.snapshot.roots, retainedSelection(active, node).semantic);
		if (currentNode === undefined) {
			return;
		}
		if (context.selection?.node === currentNode) {
			return;
		}
		if (context.selection === undefined || !sameStableTarget(context.selection.semantic.target, currentNode.target)) {
			context.inspector = undefined;
		}
		context.selection = retainedSelection(active, currentNode);
		this.emit('selection');
	}

	clearSelection(): void {
		const context = this.activeContext();
		if (context?.selection === undefined) {
			return;
		}
		context.selection = undefined;
		context.inspector = undefined;
		this.emit('selection');
	}

	/** Retains the focused Inspector group with the active definition and semantic target. */
	rememberInspectorGroup(selectedGroupId: string): void {
		const context = this.activeContext();
		if (context?.selection === undefined) {
			throw new Error('Inspector group cannot be retained without an active authored selection');
		}
		context.inspector = { target: context.selection.semantic.target, selectedGroupId };
	}

	/** Releases one closed custom document without changing any other definition context. */
	unregister(resource: string): void {
		if (!this.contexts.delete(resource)) {
			return;
		}
		if (this.activeResource === resource) {
			this.activeResource = undefined;
			this.emit('active');
		}
	}

	dispose(): void {
		this.contexts.clear();
		this.listeners.clear();
		this.activeResource = undefined;
	}

	private activeContext(): AuthoredDefinitionContext | undefined {
		return this.activeResource === undefined ? undefined : this.contexts.get(this.activeResource);
	}

	private emit(change: AuthoredDefinitionStateChange): void {
		for (const listener of this.listeners) {
			listener(change);
		}
	}
}

function retainedSelection(
	definition: AuthoredDefinitionResource,
	node: HierarchyNodeDto
): RetainedHierarchySelection {
	return {
		node,
		semantic: {
			projectGeneration: definition.projectGeneration,
			assetId: definition.assetId,
			occurrence: node.occurrence,
			target: node.target
		}
	};
}

function findRetainedNode(
	roots: readonly HierarchyNodeDto[],
	selection: HierarchySelection
): HierarchyNodeDto | undefined {
	for (const node of roots) {
		if (sameOccurrence(node.occurrence, selection.occurrence)
			&& sameStableTarget(node.target, selection.target)) {
			return node;
		}
		const nested = findRetainedNode(node.children, selection);
		if (nested !== undefined) {
			return nested;
		}
	}
	return undefined;
}

function sameStableTarget(left: HierarchySemanticTargetDto, right: HierarchySemanticTargetDto): boolean {
	return left.kind === right.kind
		&& left.identity === right.identity
		&& sameNullableOccurrence(left.occurrence, right.occurrence);
}

function sameNullableOccurrence(
	left: HierarchyOccurrenceDto | null,
	right: HierarchyOccurrenceDto | null
): boolean {
	return left === null || right === null ? left === right : sameOccurrence(left, right);
}

function sameOccurrence(left: HierarchyOccurrenceDto, right: HierarchyOccurrenceDto): boolean {
	return left.definitionAssetId === right.definitionAssetId
		&& left.entityPath.length === right.entityPath.length
		&& left.entityPath.every((value, index) => value === right.entityPath[index]);
}
