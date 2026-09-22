/*---------------------------------------------------------------------------------------------
 *  Copyright (c) JScene3D contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import './jscene3dWelcome.css';

/** The JScene3D page uses the existing Welcome editor's startup and restore behavior. */
export function createJScene3DWelcome(commandService: ICommandService, disposables: DisposableStore): HTMLElement {
	const action = (command: string, label: string): HTMLButtonElement => {
		const button = $<HTMLButtonElement>('button.jscene3d-welcome-action', { type: 'button' }, label);
		disposables.add(addDisposableListener(button, 'click', () => {
			commandService.executeCommand(command).then(undefined, onUnexpectedError);
		}));
		return button;
	};

	const mark = $<HTMLImageElement>('img.jscene3d-welcome-mark', {
		src: FileAccess.asBrowserUri('vs/workbench/contrib/jscene3d/browser/media/jscene3d-mark.svg').toString(true),
		alt: localize('jscene3dWelcome.markAlt', "JScene3D mark")
	});

	return $('.jscene3d-welcome', {},
		$('.jscene3d-welcome-heading', {},
			mark,
			$('h1', {}, localize('jscene3dWelcome.title', "JScene3D Editor")),
			$('p.jscene3d-welcome-tagline', {}, localize('jscene3dWelcome.tagline', "Build interactive 3D worlds in Java"))
		),
		$('.jscene3d-welcome-actions', {},
			$('section.jscene3d-welcome-section', {},
				$('h2', {}, localize('jscene3dWelcome.start', "Start")),
				action('jscene3d.createProject', localize('jscene3dWelcome.createProject', "Create Project")),
				action('jscene3d.openProject', localize('jscene3dWelcome.openProject', "Open Project..."))
			),
			$('section.jscene3d-welcome-section', {},
				$('h2', {}, localize('jscene3dWelcome.learn', "Learn")),
				action('jscene3d.gettingStarted', localize('jscene3dWelcome.gettingStarted', "Getting Started"))
			)
		)
	);
}
