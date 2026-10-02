/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const jscene3dApplicationName = 'jscene3d-editor';

/** Returns whether stock Chat workbench surfaces should be registered for the product. */
export function shouldRegisterChatWorkbenchSurfaces(applicationName: string): boolean {
	return applicationName !== jscene3dApplicationName;
}
