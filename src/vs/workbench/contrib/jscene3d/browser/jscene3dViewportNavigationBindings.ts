/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Scene View operation produced by a configured pointer drag. */
export type JScene3DViewportDragAction = 'orbit' | 'pan' | 'zoom';

/** User-controlled enablement for Scene View mouse and trackpad gestures. */
export interface IJScene3DViewportGestureSettings {
	readonly altDragOrbitEnabled: boolean;
	readonly shiftAltDragPanEnabled: boolean;
	readonly middleButtonPanEnabled: boolean;
	readonly scrollZoomEnabled: boolean;
	readonly pinchZoomEnabled: boolean;
	readonly altRightDragZoomEnabled: boolean;
}

/** Minimal pointer state used to resolve a configurable Scene View drag binding. */
export interface IJScene3DViewportPointerGesture {
	readonly button: number;
	readonly altKey: boolean;
	readonly shiftKey: boolean;
}

/** Resolves one pointer gesture without reserving any disabled binding. */
export function resolveJScene3DViewportDragAction(
	gesture: IJScene3DViewportPointerGesture,
	settings: IJScene3DViewportGestureSettings
): JScene3DViewportDragAction | undefined {
	if (gesture.button === 1 && settings.middleButtonPanEnabled) {
		return 'pan';
	}
	if (gesture.button === 0 && gesture.altKey && gesture.shiftKey && settings.shiftAltDragPanEnabled) {
		return 'pan';
	}
	if (gesture.button === 0 && gesture.altKey && settings.altDragOrbitEnabled) {
		return 'orbit';
	}
	if (gesture.button === 2 && gesture.altKey && settings.altRightDragZoomEnabled) {
		return 'zoom';
	}
	return undefined;
}

/** Returns whether a wheel event is enabled as pinch or ordinary scroll zoom. */
export function isJScene3DViewportWheelZoomEnabled(
	controlKey: boolean,
	settings: IJScene3DViewportGestureSettings
): boolean {
	return controlKey ? settings.pinchZoomEnabled : settings.scrollZoomEnabled;
}
