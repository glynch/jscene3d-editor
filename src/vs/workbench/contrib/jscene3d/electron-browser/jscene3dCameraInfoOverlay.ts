/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IJScene3DViewportCameraState } from '../../../../base/parts/sandbox/common/jscene3dViewport.js';
import { localize } from '../../../../nls.js';
import './media/jscene3dViewport.css';

export const JSCENE3D_CAMERA_INFO_VISIBLE_SETTING = 'jscene3d.sceneView.cameraInfo.visible';

export interface IJScene3DFormattedCameraInfo {
	readonly position: readonly [string, string, string];
	readonly orientation: readonly [string, string, string];
	readonly pivot: readonly [string, string, string];
	readonly projection: string;
}

/** Resolves the persisted overlay preference, including its enabled-by-default contract. */
export function isJScene3DCameraInfoVisible(value: boolean | undefined): boolean {
	return value ?? true;
}

/** Formats renderer-owned camera values without changing their coordinate convention. */
export function formatJScene3DCameraInfo(state: IJScene3DViewportCameraState): IJScene3DFormattedCameraInfo {
	return {
		position: formatVector(state.position, 2),
		orientation: formatVector(state.orientationDegrees, 1, '°'),
		pivot: formatVector(state.pivot, 2),
		projection: state.projection === 'perspective'
			? localize('jscene3dCameraInfoPerspective', "Perspective")
			: localize('jscene3dCameraInfoOrthographic', "Orthographic")
	};
}

/** Presents one active Scene session's renderer-authoritative editor-camera state. */
export class JScene3DCameraInfoOverlay extends Disposable {
	private readonly element: HTMLElement;
	private readonly position: HTMLElement;
	private readonly orientation: HTMLElement;
	private readonly pivot: HTMLElement;
	private readonly projection: HTMLElement;
	private active = false;
	private visible = true;
	private state: IJScene3DViewportCameraState | undefined;

	constructor(parent: HTMLElement) {
		super();
		const document = parent.ownerDocument;
		this.element = document.createElement('section');
		this.element.className = 'jscene3d-camera-info';
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', localize('jscene3dCameraInfo', "Editor Camera Information"));

		const heading = document.createElement('div');
		heading.className = 'jscene3d-camera-info-heading';
		heading.textContent = localize('jscene3dCameraInfoHeading', "Editor Camera");
		this.element.appendChild(heading);

		const values = document.createElement('div');
		values.className = 'jscene3d-camera-info-values';
		this.position = this.addRow(values, localize('jscene3dCameraInfoPosition', "Position"));
		this.orientation = this.addRow(values, localize('jscene3dCameraInfoOrientation', "Orientation"));
		this.pivot = this.addRow(values, localize('jscene3dCameraInfoPivot', "Pivot"));
		this.projection = this.addRow(values, localize('jscene3dCameraInfoProjection', "Projection"));
		this.element.appendChild(values);
		parent.appendChild(this.element);
		this.updateVisibility();
	}

	setActive(active: boolean): void {
		this.active = active;
		this.updateVisibility();
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.updateVisibility();
	}

	setState(state: IJScene3DViewportCameraState | undefined): void {
		this.state = state;
		if (state) {
			const formatted = formatJScene3DCameraInfo(state);
			this.position.textContent = formatted.position.join('  ');
			this.orientation.textContent = formatted.orientation.join('  ');
			this.pivot.textContent = formatted.pivot.join('  ');
			this.projection.textContent = formatted.projection;
		}
		this.updateVisibility();
	}

	override dispose(): void {
		this.element.remove();
		super.dispose();
	}

	private addRow(parent: HTMLElement, label: string): HTMLElement {
		const row = parent.ownerDocument.createElement('div');
		row.className = 'jscene3d-camera-info-row';
		const labelElement = parent.ownerDocument.createElement('span');
		labelElement.className = 'jscene3d-camera-info-label';
		labelElement.textContent = label;
		const value = parent.ownerDocument.createElement('span');
		value.className = 'jscene3d-camera-info-value';
		row.append(labelElement, value);
		parent.appendChild(row);
		return value;
	}

	private updateVisibility(): void {
		const shown = this.active && this.visible && this.state !== undefined;
		this.element.classList.toggle('is-visible', shown);
		this.element.setAttribute('aria-hidden', String(!shown));
	}
}

function formatVector(
	value: readonly [number, number, number],
	precision: number,
	suffix = ''
): readonly [string, string, string] {
	return [
		formatNumber(value[0], precision, suffix),
		formatNumber(value[1], precision, suffix),
		formatNumber(value[2], precision, suffix)
	];
}

function formatNumber(value: number, precision: number, suffix: string): string {
	const formatted = value.toFixed(precision);
	return `${Number(formatted) === 0 ? formatted.replace(/^-/, '') : formatted}${suffix}`;
}
