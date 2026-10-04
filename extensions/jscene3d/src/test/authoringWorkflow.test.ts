/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	AuthoringWorkflow,
	AuthoringWorkflowDefinitionOpener,
	AuthoringWorkflowHost,
	AuthoringWorkflowNotification,
	AuthoringWorkflowProjectLifecycle,
	AuthoringWorkflowProjectState
} from '../authoring/authoringWorkflow';
import { AuthoredDefinitionOpenOutcome } from '../definition/authoredDefinitionOpener';
import { ProjectLocation } from '../project/projectLocation';
import { ProjectSnapshot } from '../project/projectState';
import { ProjectReopenOutcome, ProjectSessionOpenResult } from '../project/projectSessionLifecycle';
import { DefinitionSnapshotDto, ProjectDiagnosticDto, ProjectSummaryDto } from '../protocol/authoringProtocol';

suite('JScene3D authoring workflow', () => {
	test('opens and reveals a Project without a window transition', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.lifecycle.nextOpen = { status: 'opened' };

		await fixture.workflow.openProject();

		assert.deepStrictEqual(fixture.lifecycle.opened, [{ scheme: 'file', fsPath: '/projects/a/a.j3d' }]);
		assert.deepStrictEqual(fixture.host.notifications, []);
		assert.deepStrictEqual(fixture.host.diagnosticPublications, [[]]);
		assert.strictEqual(fixture.host.projectRevealCalls, 1);
		assert.deepStrictEqual(fixture.opener.calls, []);
	});

	test('treats project selection cancellation as a no-op', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.host.selection = undefined;

		await fixture.workflow.openProject();

		assert.deepStrictEqual(fixture.lifecycle.opened, []);
		assert.deepStrictEqual(fixture.host.notifications, []);
		assert.deepStrictEqual(fixture.host.diagnosticPublications, []);
		assert.strictEqual(fixture.host.projectRevealCalls, 0);
	});

	test('rejects a non-local project selection before invoking project lifecycle', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.host.selection = { scheme: 'vscode-remote', fsPath: '/projects/a/a.j3d' };

		await fixture.workflow.openProject();

		assert.deepStrictEqual(fixture.lifecycle.opened, []);
		assert.deepStrictEqual(fixture.host.notifications, ['localProjectRequired']);
		assert.strictEqual(fixture.host.projectRevealCalls, 0);
		assert.ok(fixture.logger.lines.some(line => line.startsWith('Open Project command rejected')));
	});

	test('selects the rejected initial-project notification', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.lifecycle.nextOpen = { status: 'openRejected' };

		await fixture.workflow.openProject();

		assert.deepStrictEqual(fixture.host.notifications, ['projectOpenRejected']);
		assert.strictEqual(fixture.host.projectRevealCalls, 0);
	});

	test('distinguishes replacement success, candidate rejection, and conflict', async () => {
		for (const scenario of [
			{
				outcome: { status: 'replaced' } as const,
				notification: undefined,
				projectRevealCalls: 1
			},
			{
				outcome: { status: 'candidateRejected' } as const,
				notification: 'projectCandidateRejected' as const,
				projectRevealCalls: 0
			},
			{
				outcome: { status: 'conflict' } as const,
				notification: 'projectReplacementConflict' as const,
				projectRevealCalls: 0
			}
		]) {
			const fixture = workflowFixture(openSnapshot());
			fixture.lifecycle.nextOpen = scenario.outcome;

			await fixture.workflow.openProject();

			assert.deepStrictEqual(fixture.host.notifications,
				scenario.notification === undefined ? [] : [scenario.notification]);
			assert.strictEqual(fixture.host.projectRevealCalls, scenario.projectRevealCalls);
		}
	});

	test('logs unexpected project-open failures and selects infrastructure notification', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.lifecycle.openError = new Error('authoring unavailable');

		await fixture.workflow.openProject();

		assert.deepStrictEqual(fixture.host.notifications, ['projectOpenFailed']);
		assert.strictEqual(fixture.host.projectRevealCalls, 0);
		assert.ok(fixture.logger.lines.includes('Open Project command failed: authoring unavailable'));
	});

	test('closes a project and reports only unexpected close failures', async () => {
		const successful = workflowFixture(openSnapshot());
		await successful.workflow.closeProject();
		assert.strictEqual(successful.lifecycle.closeCalls, 1);
		assert.deepStrictEqual(successful.host.notifications, []);
		assert.deepStrictEqual(successful.host.diagnosticPublications, [[]]);

		const failed = workflowFixture(openSnapshot());
		failed.lifecycle.closeError = new Error('close unavailable');
		await failed.workflow.closeProject();
		assert.deepStrictEqual(failed.host.notifications, ['projectCloseFailed']);
		assert.ok(failed.logger.lines.includes('Close Project command failed: close unavailable'));
	});

	test('opens a definition and replaces stale definition diagnostics', async () => {
		const fixture = workflowFixture(openSnapshot());
		fixture.opener.next = openedDefinitionOutcome([definitionWarning]);

		await fixture.workflow.openDefinition('world:a');

		assert.deepStrictEqual(fixture.opener.calls, [{ projectGeneration: 7, projectId: 'project-a', assetId: 'world:a' }]);
		assert.deepStrictEqual(fixture.host.diagnosticPublications, [[], [definitionWarning]]);
		assert.deepStrictEqual(fixture.host.notifications, []);
	});

	test('publishes Java-resolved diagnostics for an expected definition rejection', async () => {
		const fixture = workflowFixture(openSnapshot());
		fixture.opener.next = {
			status: 'rejected',
			diagnostics: [definitionError],
			failureCode: 'definition.invalid'
		};

		await fixture.workflow.openDefinition('world:a');

		assert.deepStrictEqual(fixture.host.diagnosticPublications, [[], [definitionError]]);
		assert.strictEqual(fixture.host.diagnosticPublications[1][0].message, 'Java-resolved definition error');
		assert.deepStrictEqual(fixture.host.notifications, ['definitionOpenRejected']);
		assert.ok(fixture.logger.lines.includes('Definition open rejected: definition.invalid'));
	});

	test('keeps unexpected definition failures on the exception path', async () => {
		const fixture = workflowFixture(openSnapshot());
		fixture.opener.error = new Error('protocol disconnected');

		await fixture.workflow.openDefinition('world:a');

		assert.deepStrictEqual(fixture.host.diagnosticPublications, [[]]);
		assert.deepStrictEqual(fixture.host.notifications, ['definitionOpenFailed']);
		assert.ok(fixture.logger.lines.includes('Open Definition command failed: protocol disconnected'));
	});

	test('requires an open project before invoking the definition operation', async () => {
		const fixture = workflowFixture(closedSnapshot());

		await fixture.workflow.openDefinition();

		assert.deepStrictEqual(fixture.opener.calls, []);
		assert.deepStrictEqual(fixture.host.notifications, ['projectRequired']);
	});

	test('rejects a Project-tree command from a stale project generation before protocol dispatch', async () => {
		const fixture = workflowFixture(openSnapshot(8));

		await fixture.workflow.openDefinition('world:a', 7);

		assert.deepStrictEqual(fixture.opener.calls, []);
		assert.deepStrictEqual(fixture.host.notifications, ['definitionOpenRejected']);
		assert.ok(fixture.logger.lines.includes(
			'Definition open rejected: Project generation 7 is stale; active generation is 8'
		));
	});

	test('clears definition diagnostics when the authoritative project generation changes', () => {
		const fixture = workflowFixture(openSnapshot());

		fixture.state.setSnapshot(openSnapshot(8));
		fixture.state.setSnapshot(closedSnapshot());

		assert.deepStrictEqual(fixture.host.diagnosticPublications, [[], []]);
	});

	test('selects the persisted-project reopen failure notification', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.lifecycle.nextReopen = { status: 'failed', reason: 'invalid intent' };

		await fixture.workflow.reopenPersistedProject();

		assert.deepStrictEqual(fixture.host.notifications, ['projectReopenFailed']);
		assert.strictEqual(fixture.host.projectRevealCalls, 0);
	});

	test('reveals the Project after a successful persisted Project reopen', async () => {
		const fixture = workflowFixture(closedSnapshot());
		fixture.lifecycle.nextReopen = { status: 'reopened' };

		await fixture.workflow.reopenPersistedProject();

		assert.deepStrictEqual(fixture.host.notifications, []);
		assert.strictEqual(fixture.host.projectRevealCalls, 1);
	});
});

interface WorkflowFixture {
	readonly state: TestProjectState;
	readonly lifecycle: TestProjectLifecycle;
	readonly opener: TestDefinitionOpener;
	readonly host: TestWorkflowHost;
	readonly logger: TestLogger;
	readonly workflow: AuthoringWorkflow;
}

function workflowFixture(snapshot: ProjectSnapshot): WorkflowFixture {
	const state = new TestProjectState(snapshot);
	const lifecycle = new TestProjectLifecycle();
	const opener = new TestDefinitionOpener();
	const host = new TestWorkflowHost();
	const logger = new TestLogger();
	const workflow = new AuthoringWorkflow(state, lifecycle, opener, host, logger);
	return { state, lifecycle, opener, host, logger, workflow };
}

class TestProjectState implements AuthoringWorkflowProjectState {
	private readonly listeners = new Set<() => void>();

	constructor(public snapshot: ProjectSnapshot) { }

	onDidChange(listener: () => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	setSnapshot(snapshot: ProjectSnapshot): void {
		this.snapshot = snapshot;
		for (const listener of this.listeners) {
			listener();
		}
	}
}

class TestProjectLifecycle implements AuthoringWorkflowProjectLifecycle {
	nextOpen: ProjectSessionOpenResult = { status: 'opened' };
	nextReopen: ProjectReopenOutcome = { status: 'none' };
	openError: Error | undefined;
	closeError: Error | undefined;
	readonly opened: ProjectLocation[] = [];
	closeCalls = 0;

	openProject(location: ProjectLocation): Promise<ProjectSessionOpenResult> {
		this.opened.push(location);
		return this.openError === undefined ? Promise.resolve(this.nextOpen) : Promise.reject(this.openError);
	}

	closeProject(): Promise<void> {
		this.closeCalls++;
		return this.closeError === undefined ? Promise.resolve() : Promise.reject(this.closeError);
	}

	reopenPersistedProject(): Promise<ProjectReopenOutcome> {
		return Promise.resolve(this.nextReopen);
	}
}

class TestDefinitionOpener implements AuthoringWorkflowDefinitionOpener {
	next: AuthoredDefinitionOpenOutcome = openedDefinitionOutcome([]);
	error: Error | undefined;
	readonly calls: Array<{ projectGeneration: number; projectId: string; assetId: string }> = [];

	open(projectGeneration: number, projectId: string, assetId: string): Promise<AuthoredDefinitionOpenOutcome> {
		this.calls.push({ projectGeneration, projectId, assetId });
		return this.error === undefined ? Promise.resolve(this.next) : Promise.reject(this.error);
	}
}

class TestWorkflowHost implements AuthoringWorkflowHost {
	selection: ProjectLocation | undefined = { scheme: 'file', fsPath: '/projects/a/a.j3d' };
	readonly diagnosticPublications: Array<readonly ProjectDiagnosticDto[]> = [];
	readonly notifications: AuthoringWorkflowNotification[] = [];
	projectRevealCalls = 0;

	selectProjectDescriptor(): Promise<ProjectLocation | undefined> {
		return Promise.resolve(this.selection);
	}

	publishDefinitionDiagnostics(diagnostics: readonly ProjectDiagnosticDto[]): void {
		this.diagnosticPublications.push(diagnostics);
	}

	revealProject(): Promise<void> {
		this.projectRevealCalls++;
		return Promise.resolve();
	}

	notify(notification: AuthoringWorkflowNotification): Promise<void> {
		this.notifications.push(notification);
		return Promise.resolve();
	}
}

class TestLogger {
	readonly lines: string[] = [];

	appendLine(message: string): void {
		this.lines.push(message);
	}
}

function openedDefinitionOutcome(diagnostics: readonly ProjectDiagnosticDto[]): AuthoredDefinitionOpenOutcome {
	return {
		status: 'opened',
		resource: {
			resource: 'file:///projects/a/worlds/main.scene.json?jscene3dProjectId=project-a&jscene3dAssetId=world%3Aa',
			projectGeneration: 7,
			assetId: 'world:a',
			snapshot: definitionSnapshot
		},
		diagnostics
	};
}

function openSnapshot(generation = 7): ProjectSnapshot {
	return { status: 'open', generation, project: projectSummary, activeDiagnostics: [], attemptDiagnostics: [] };
}

function closedSnapshot(): ProjectSnapshot {
	return { status: 'closed', activeDiagnostics: [], attemptDiagnostics: [] };
}

const projectSummary: ProjectSummaryDto = {
	id: 'project-a',
	name: 'Project A',
	version: '1.0.0',
	root: '/projects/a',
	descriptor: '/projects/a/a.j3d',
	mainScene: { id: 'world:a', name: 'World A' },
	assetCounts: { authored: 1, projected: 0 },
	catalog: {
		scenes: [{
			id: 'world:a', name: 'World A', source: 'file:///projects/a/worlds/a.scene.json',
			origin: 'authored', editable: true, mainScene: true
		}],
		entityDefinitions: []
	}
};

const definitionSnapshot: DefinitionSnapshotDto = {
	revision: 0,
	context: {
		assetId: 'world:a',
		kind: 'scene-definition',
		origin: 'authored',
		editable: true,
		source: 'file:///projects/a/worlds/main.scene.json',
		label: { kind: 'literal', text: 'World A', messageCode: null, arguments: [] }
	},
	roots: []
};

const definitionWarning: ProjectDiagnosticDto = {
	severity: 'warning',
	code: 'definition.warning',
	message: 'Java-resolved definition warning',
	source: 'file:///projects/a/worlds/main.scene.json',
	location: '/root',
	details: {}
};

const definitionError: ProjectDiagnosticDto = {
	...definitionWarning,
	severity: 'error',
	code: 'definition.invalid',
	message: 'Java-resolved definition error'
};
