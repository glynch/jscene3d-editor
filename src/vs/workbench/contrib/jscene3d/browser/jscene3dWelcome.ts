/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, reset } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import './jscene3dWelcome.css';

const getRecentProjectsCommandId = 'jscene3d.getRecentProjects';
const openRecentProjectCommandId = 'jscene3d.openRecentProject';
const collapsedRecentProjectCount = 4;

interface RecentProject {
	readonly projectId: string;
	readonly name: string;
	readonly descriptorUri: string;
	readonly compactPath: string;
	readonly lastOpenedAt?: number;
}

interface WelcomeAction {
	readonly command: string;
	readonly icon: WelcomeActionIcon;
	readonly title: string;
	readonly description: string;
	readonly label: string;
	readonly primary?: boolean;
}

type WelcomeActionIcon =
	| { readonly kind: 'codicon'; readonly name: 'folder' | 'source-control' }
	| { readonly kind: 'asset'; readonly name: 'project-new' | 'documentation' };

/** The JScene3D page uses the existing Welcome editor's startup and restore behavior. */
export function createJScene3DWelcome(
	commandService: ICommandService,
	disposables: DisposableStore,
	now: () => number = Date.now
): HTMLElement {
	const execute = (command: string, ...args: unknown[]): void => {
		commandService.executeCommand(command, ...args).then(undefined, onUnexpectedError);
	};
	const card = (action: WelcomeAction): HTMLElement => {
		const icon = action.icon.kind === 'codicon'
			? $(`span.jscene3d-welcome-card-icon.codicon.codicon-${action.icon.name}`, { 'aria-hidden': 'true' })
			: $<HTMLImageElement>('img.jscene3d-welcome-card-icon', {
				src: FileAccess.asBrowserUri(
					`vs/workbench/contrib/jscene3d/browser/media/jscene3d-welcome-${action.icon.name}.svg`
				).toString(true),
				alt: '',
				'aria-hidden': 'true'
			});
		const button = $<HTMLButtonElement>(
			`button.jscene3d-welcome-card-button${action.primary ? '.primary' : ''}`,
			{ type: 'button' },
			action.label
		);
		disposables.add(addDisposableListener(button, 'click', () => execute(action.command)));
		return $('article.jscene3d-welcome-card', {},
			$('.jscene3d-welcome-card-icon-area', {}, icon),
			$('h2', {}, action.title),
			$('p', {}, action.description),
			$('.jscene3d-welcome-card-spacer', { 'aria-hidden': 'true' }),
			button
		);
	};

	const mark = $<HTMLImageElement>('img.jscene3d-welcome-mark', {
		src: FileAccess.asBrowserUri('vs/workbench/contrib/jscene3d/browser/media/jscene3d-mark.svg').toString(true),
		alt: localize('jscene3dWelcome.markAlt', "JScene3D mark")
	});
	const artwork = $<HTMLImageElement>('img.jscene3d-welcome-hero-artwork', {
		src: FileAccess.asBrowserUri('vs/workbench/contrib/jscene3d/browser/media/jscene3d-welcome-hero.png').toString(true),
		alt: '',
		'aria-hidden': 'true'
	});
	const recentProjects = $('.jscene3d-welcome-recent-list', {},
		$('div.jscene3d-welcome-recent-loading', {}, localize('jscene3dWelcome.recent.loading', "Loading recent Projects…"))
	);
	const showMore = $<HTMLButtonElement>('button.jscene3d-welcome-show-more', { type: 'button', hidden: true },
		localize('jscene3dWelcome.recent.showMore', "Show More")
	);
	let disposed = false;
	let revealAllRecentProjects = (): void => { };
	disposables.add(toDisposable(() => disposed = true));

	disposables.add(addDisposableListener(showMore, 'click', () => {
		showMore.hidden = true;
		revealAllRecentProjects();
	}));

	commandService.executeCommand<unknown>(getRecentProjectsCommandId).then(value => {
		if (!disposed) {
			revealAllRecentProjects = renderRecentProjects(
				parseRecentProjects(value), recentProjects, showMore, execute, disposables, now());
		}
	}, error => {
		if (!disposed) {
			revealAllRecentProjects = renderRecentProjects(
				[], recentProjects, showMore, execute, disposables, now());
		}
		onUnexpectedError(error);
	});

	return $('.jscene3d-welcome', {},
		$('section.jscene3d-welcome-hero', {},
			artwork,
			$('.jscene3d-welcome-hero-shade'),
			$('.jscene3d-welcome-hero-content', {},
				$('.jscene3d-welcome-brand', {},
					mark,
					$('h1', {}, localize('jscene3dWelcome.title', "JScene3D"))
				),
				$('h2', {}, localize('jscene3dWelcome.tagline', "Create. Build. Play.")),
				$('p.jscene3d-welcome-description', {}, localize(
					'jscene3dWelcome.description',
					"A modular 3D engine and authoring platform for Java developers."
				)),
				$('.jscene3d-welcome-hero-statements', {},
					$('span', {}, localize('jscene3dWelcome.tools', "Tools for real worlds.")),
					$('span', {}, localize('jscene3dWelcome.developers', "Built by developers."))
				)
			)
		),
		$('section.jscene3d-welcome-actions', { 'aria-label': localize('jscene3dWelcome.actions', "Project actions") },
			card({
				command: 'jscene3d.createProject',
				icon: { kind: 'asset', name: 'project-new' },
				title: localize('jscene3dWelcome.createProject', "Create Project"),
				description: localize('jscene3dWelcome.createProject.description', "Start a new JScene3D Project from a template."),
				label: localize('jscene3dWelcome.createProject.action', "New Project"),
				primary: true
			}),
			card({
				command: 'jscene3d.openProject',
				icon: { kind: 'codicon', name: 'folder' },
				title: localize('jscene3dWelcome.openProject', "Open Project"),
				description: localize('jscene3dWelcome.openProject.description', "Open an existing local JScene3D Project."),
				label: localize('jscene3dWelcome.openProject.action', "Open…")
			}),
			card({
				command: 'git.cloneRecursive',
				icon: { kind: 'codicon', name: 'source-control' },
				title: localize('jscene3dWelcome.cloneRepository', "Clone Repository"),
				description: localize('jscene3dWelcome.cloneRepository.description', "Clone a Git repository containing a JScene3D Project."),
				label: localize('jscene3dWelcome.cloneRepository.action', "Clone…")
			}),
			card({
				command: 'jscene3d.gettingStarted',
				icon: { kind: 'asset', name: 'documentation' },
				title: localize('jscene3dWelcome.getStarted', "Get Started"),
				description: localize('jscene3dWelcome.getStarted.description', "Learn the foundations of creating with JScene3D."),
				label: localize('jscene3dWelcome.getStarted.action', "View Guide")
			})
		),
		$('section.jscene3d-welcome-recent', {},
			$('.jscene3d-welcome-recent-header', {},
				$('.jscene3d-welcome-recent-title', {},
					$('span.codicon.codicon-history', { 'aria-hidden': 'true' }),
					$('h2', {}, localize('jscene3dWelcome.recent.title', "Recent Projects"))
				),
				showMore
			),
			recentProjects
		)
	);
}

/** Formats one persisted last-opened timestamp for the compact Welcome history. */
export function formatJScene3DRecentProjectTime(lastOpenedAt: number, now: number): string {
	const elapsedMinutes = Math.max(0, Math.floor((now - lastOpenedAt) / 60_000));
	if (elapsedMinutes < 1) {
		return localize('jscene3dWelcome.recent.justNow', "Just now");
	}
	if (elapsedMinutes < 60) {
		return elapsedMinutes === 1
			? localize('jscene3dWelcome.recent.minute', "1 minute ago")
			: localize('jscene3dWelcome.recent.minutes', "{0} minutes ago", elapsedMinutes);
	}
	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) {
		return elapsedHours === 1
			? localize('jscene3dWelcome.recent.hour', "1 hour ago")
			: localize('jscene3dWelcome.recent.hours', "{0} hours ago", elapsedHours);
	}
	const elapsedDays = Math.floor(elapsedHours / 24);
	if (elapsedDays < 7) {
		return elapsedDays === 1
			? localize('jscene3dWelcome.recent.day', "1 day ago")
			: localize('jscene3dWelcome.recent.days', "{0} days ago", elapsedDays);
	}
	const elapsedWeeks = Math.floor(elapsedDays / 7);
	return elapsedWeeks === 1
		? localize('jscene3dWelcome.recent.week', "1 week ago")
		: localize('jscene3dWelcome.recent.weeks', "{0} weeks ago", elapsedWeeks);
}

function renderRecentProjects(
	projects: readonly RecentProject[],
	container: HTMLElement,
	showMore: HTMLButtonElement,
	execute: (command: string, ...args: unknown[]) => void,
	disposables: DisposableStore,
	now: number
): () => void {
	if (projects.length === 0) {
		showMore.hidden = true;
		reset(container, $('.jscene3d-welcome-recent-empty', {},
			$('span.codicon.codicon-clock', { 'aria-hidden': 'true' }),
			$('span', {}, localize(
				'jscene3dWelcome.recent.empty',
				"Projects you open in JScene3D will appear here."
			))
		));
		return () => { };
	}

	const rows = projects.map((project, index) => {
		const row = $<HTMLButtonElement>('button.jscene3d-welcome-recent-row', {
			type: 'button',
			title: project.compactPath
		},
			$('.jscene3d-welcome-recent-project', {},
				$('span.jscene3d-welcome-recent-name', {}, project.name),
				$('span.jscene3d-welcome-recent-path', {}, project.compactPath)
			),
			project.lastOpenedAt === undefined
				? $('span.jscene3d-welcome-recent-time')
				: $('span.jscene3d-welcome-recent-time', {}, formatJScene3DRecentProjectTime(project.lastOpenedAt, now))
		);
		row.hidden = index >= collapsedRecentProjectCount;
		disposables.add(addDisposableListener(row, 'click', () => execute(openRecentProjectCommandId, project.descriptorUri)));
		return row;
	});
	showMore.hidden = projects.length <= collapsedRecentProjectCount;
	reset(container, ...rows);
	return () => {
		for (const row of rows) {
			row.hidden = false;
		}
	};
}

function parseRecentProjects(value: unknown): readonly RecentProject[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((project): project is RecentProject => isRecord(project)
		&& typeof project.projectId === 'string'
		&& typeof project.name === 'string'
		&& typeof project.descriptorUri === 'string'
		&& typeof project.compactPath === 'string'
		&& (project.lastOpenedAt === undefined
			|| typeof project.lastOpenedAt === 'number' && Number.isFinite(project.lastOpenedAt)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
