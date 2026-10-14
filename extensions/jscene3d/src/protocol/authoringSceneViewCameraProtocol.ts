/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { validateSceneViewComponentIdentity, SceneViewComponentIdentityDto } from './authoringSceneViewIdentityProtocol';
import { JsonValue } from './messageTransport';
import { requiredBoolean, requiredDecimal, requiredObject, requiredString } from './authoringProtocolValidation';

/** Authored camera projection semantics carried on the authoring wire. */
export type SceneViewCameraDto =
	| {
		readonly kind: 'perspective';
		readonly identity: SceneViewComponentIdentityDto;
		readonly fieldOfViewDegrees: string;
		readonly near: string;
		readonly far: string;
		readonly primary: boolean;
	}
	| {
		readonly kind: 'orthographic';
		readonly identity: SceneViewComponentIdentityDto;
		readonly left: string;
		readonly right: string;
		readonly top: string;
		readonly bottom: string;
		readonly near: string;
		readonly far: string;
		readonly zoom: string;
		readonly primary: boolean;
	};

/** Validates one finite, semantically valid authored camera projection. */
export function validateSceneViewCamera(value: JsonValue): SceneViewCameraDto {
	const object = requiredObject(value, 'Scene View camera');
	const kind = requiredString(object.kind, 'camera kind');
	const identity = validateSceneViewComponentIdentity(object.identity);
	const primary = requiredBoolean(object.primary, 'primary');
	if (kind === 'perspective') {
		const fieldOfViewDegrees = finiteDecimal(object.fieldOfViewDegrees, 'fieldOfViewDegrees');
		const near = finiteDecimal(object.near, 'near');
		const far = finiteDecimal(object.far, 'far');
		if (number(fieldOfViewDegrees) <= 0 || number(fieldOfViewDegrees) >= 180
			|| number(near) <= 0 || number(far) <= number(near)) {
			throw new Error('Perspective camera projection is invalid');
		}
		return { kind, identity, fieldOfViewDegrees, near, far, primary };
	}
	if (kind === 'orthographic') {
		const left = finiteDecimal(object.left, 'left');
		const right = finiteDecimal(object.right, 'right');
		const top = finiteDecimal(object.top, 'top');
		const bottom = finiteDecimal(object.bottom, 'bottom');
		const near = finiteDecimal(object.near, 'near');
		const far = finiteDecimal(object.far, 'far');
		const zoom = finiteDecimal(object.zoom, 'zoom');
		if (number(left) >= number(right) || number(bottom) >= number(top)
			|| number(near) < 0 || number(far) <= number(near) || number(zoom) <= 0) {
			throw new Error('Orthographic camera projection is invalid');
		}
		return { kind, identity, left, right, top, bottom, near, far, zoom, primary };
	}
	throw new Error('Scene View camera kind is invalid');
}

function finiteDecimal(value: JsonValue | undefined, name: string): string {
	const decimal = requiredDecimal(value, name);
	if (!Number.isFinite(number(decimal))) {
		throw new Error(`${name} must be finite`);
	}
	return decimal;
}

function number(value: string): number {
	return Number(value);
}
