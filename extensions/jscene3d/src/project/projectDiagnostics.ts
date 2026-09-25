/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectDiagnosticDto } from '../protocol/authoringProtocol';

/** Replaces the native Problems entries for the current Java project result. */
export function publishProjectDiagnostics(collection: vscode.DiagnosticCollection, diagnostics: readonly ProjectDiagnosticDto[]): void {
	collection.clear();
	const grouped = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();
	for (const source of diagnostics) {
		const uri = diagnosticUri(source.source);
		const key = uri.toString();
		let group = grouped.get(key);
		if (group === undefined) {
			group = { uri, diagnostics: [] };
			grouped.set(key, group);
		}
		const diagnostic = new vscode.Diagnostic(
			new vscode.Range(0, 0, 0, 0),
			source.location.length === 0
				? source.message
				: `${source.message}\n${vscode.l10n.t('JSON location: {0}', source.location)}`,
			diagnosticSeverity(source.severity)
		);
		diagnostic.code = source.code;
		diagnostic.source = 'JScene3D';
		group.diagnostics.push(diagnostic);
	}
	collection.set(Array.from(grouped.values(), group => [group.uri, group.diagnostics]));
}

/** Resolves an absolute Java diagnostic URI while tolerating platform file paths. */
function diagnosticUri(source: string): vscode.Uri {
	try {
		const parsed = vscode.Uri.parse(source, true);
		return parsed.scheme.length === 1 ? vscode.Uri.file(source) : parsed;
	} catch {
		return vscode.Uri.file(source);
	}
}

/** Maps the presentation severity onto VS Code's native severity. */
function diagnosticSeverity(severity: ProjectDiagnosticDto['severity']): vscode.DiagnosticSeverity {
	switch (severity) {
		case 'error': return vscode.DiagnosticSeverity.Error;
		case 'warning': return vscode.DiagnosticSeverity.Warning;
	}
}
