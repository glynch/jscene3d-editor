/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectDiagnosticDto } from '../protocol/authoringProtocol';

export type ProjectDiagnosticSeverity = ProjectDiagnosticDto['severity'];

/** VS Code-independent presentation data for one project diagnostic. */
export interface ProjectDiagnosticPresentation {
	readonly source: string;
	readonly severity: ProjectDiagnosticSeverity;
	readonly code: string;
	readonly message: string;
	readonly location: string;
}

/** Projects Java diagnostics into presentation data without losing wire metadata. */
export function projectDiagnosticPresentations(diagnostics: readonly ProjectDiagnosticDto[]): readonly ProjectDiagnosticPresentation[] {
	return diagnostics.map(diagnostic => ({
		source: diagnostic.source,
		severity: diagnostic.severity,
		code: diagnostic.code,
		message: diagnostic.message,
		location: diagnostic.location
	}));
}
