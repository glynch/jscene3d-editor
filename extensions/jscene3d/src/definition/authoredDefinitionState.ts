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

/** Extension-owned semantic selection for a future Inspector consumer. */
export interface HierarchySelection {
	readonly projectGeneration: number;
	readonly assetId: string;
	readonly occurrence: HierarchyOccurrenceDto;
	readonly target: HierarchySemanticTargetDto;
}

/** Owns generation-scoped editor-resource mappings, active definition, and local hierarchy selection. */
export class AuthoredDefinitionState {
	private readonly listeners = new Set<() => void>();
	private readonly resources = new Map<string, AuthoredDefinitionResource>();
	private projectGeneration: number | undefined;
	private activeValue: AuthoredDefinitionResource | undefined;
	private selectionValue: HierarchySelection | undefined;

	get active(): AuthoredDefinitionResource | undefined {
		return this.activeValue;
	}

	get selection(): HierarchySelection | undefined {
		return this.selectionValue;
	}

	onDidChange(listener: () => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	setProjectGeneration(projectGeneration: number | undefined): void {
		if (projectGeneration === this.projectGeneration) {
			return;
		}
		this.projectGeneration = projectGeneration;
		this.resources.clear();
		this.activeValue = undefined;
		this.selectionValue = undefined;
		this.emit();
	}

	register(resource: string, projectGeneration: number, snapshot: DefinitionSnapshotDto): AuthoredDefinitionResource {
		if (projectGeneration !== this.projectGeneration) {
			throw new Error('Definition resource does not belong to the active project generation');
		}
		const mapping = {
			resource,
			projectGeneration,
			assetId: snapshot.context.assetId,
			snapshot
		};
		this.resources.set(resource, mapping);
		return mapping;
	}

	resolve(resource: string): AuthoredDefinitionResource | undefined {
		const mapping = this.resources.get(resource);
		return mapping?.projectGeneration === this.projectGeneration ? mapping : undefined;
	}

	resolveAsset(projectGeneration: number, assetId: string): AuthoredDefinitionResource | undefined {
		if (projectGeneration !== this.projectGeneration) {
			return undefined;
		}
		return Array.from(this.resources.values()).find(mapping => mapping.assetId === assetId);
	}

	update(resource: string, snapshot: DefinitionSnapshotDto): AuthoredDefinitionResource {
		const current = this.resolve(resource);
		if (current === undefined || current.assetId !== snapshot.context.assetId) {
			throw new Error('Definition refresh does not belong to the active document identity');
		}
		const updated = { ...current, snapshot };
		this.resources.set(resource, updated);
		if (this.activeValue === current) {
			this.activeValue = updated;
		}
		this.emit();
		return updated;
	}

	activate(resource: string | undefined): void {
		const active = resource === undefined ? undefined : this.resolve(resource);
		if (active === this.activeValue) {
			return;
		}
		this.activeValue = active;
		this.selectionValue = undefined;
		this.emit();
	}

	select(node: HierarchyNodeDto): void {
		const active = this.activeValue;
		if (active === undefined || node.occurrence.definitionAssetId !== active.assetId) {
			throw new Error('Hierarchy selection does not belong to the active definition');
		}
		this.selectionValue = {
			projectGeneration: active.projectGeneration,
			assetId: active.assetId,
			occurrence: node.occurrence,
			target: node.target
		};
		this.emit();
	}

	clearSelection(): void {
		if (this.selectionValue === undefined) {
			return;
		}
		this.selectionValue = undefined;
		this.emit();
	}

	dispose(): void {
		this.resources.clear();
		this.listeners.clear();
		this.activeValue = undefined;
		this.selectionValue = undefined;
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
