/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { dedupExtensions } from '../../common/extensionsUtil.js';

suite('Extension utilities', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const productService = { requiredExtensions: ['pub.required'] };
	const logService = new NullLogService();

	test('required builtin wins over newer and older user copies', () => {
		const system = extension('pub.required', '2.0.0', true, 'system');
		for (const version of ['1.0.0', '3.0.0']) {
			const result = dedupExtensions([system], [extension('pub.required', version, false, `user-${version}`)], [], [], logService, productService);
			assert.deepStrictEqual(result, [system]);
		}
	});

	test('required builtin wins over workspace copy', () => {
		const system = extension('pub.required', '2.0.0', true, 'system');
		const result = dedupExtensions([system], [], [extension('pub.required', '3.0.0', false, 'workspace')], [], logService, productService);
		assert.deepStrictEqual(result, [system]);
	});

	test('development copy overrides required builtin', () => {
		const development = extension('pub.required', '3.0.0', false, 'development');
		const result = dedupExtensions([extension('pub.required', '2.0.0', true, 'system')], [], [], [development], logService, productService);
		assert.deepStrictEqual(result, [development]);
		assert.strictEqual(development.isBuiltin, true);
	});

	test('ordinary builtin keeps existing version precedence', () => {
		const user = extension('pub.optional', '3.0.0', false, 'user');
		const result = dedupExtensions([extension('pub.optional', '2.0.0', true, 'system')], [user], [], [], logService, productService);
		assert.deepStrictEqual(result, [user]);
		assert.strictEqual(user.isBuiltin, true);
	});
});

function extension(id: string, version: string, isBuiltin: boolean, location: string): IExtensionDescription {
	const [publisher, name] = id.split('.');
	return {
		name,
		publisher,
		version,
		engines: { vscode: '^1.0.0' },
		identifier: new ExtensionIdentifier(id),
		extensionLocation: URI.parse(`test:///${location}`),
		isBuiltin,
		isUnderDevelopment: false,
		isUserBuiltin: false,
		activationEvents: ['*'],
		main: 'index.js',
		targetPlatform: TargetPlatform.UNDEFINED,
		extensionDependencies: [],
		enabledApiProposals: undefined,
		preRelease: false,
	};
}
