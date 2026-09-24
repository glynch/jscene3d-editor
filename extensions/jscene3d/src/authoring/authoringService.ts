/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { AuthoringProtocolClient, InitializeResultDto, ProjectCloseResultDto, ProjectOpenResultDto } from '../protocol/authoringProtocol';
import { JsonRpcClient, JsonRpcError } from '../protocol/jsonRpcClient';
import { StreamMessageTransport } from '../protocol/messageTransport';

const serviceModule = 'io.github.glynch.jscene3d.editor.authoring.service/io.github.glynch.jscene3d.editor.authoring.process.AuthoringServiceMain';
const shutdownGracePeriodMilliseconds = 3000;

/** Receives operational authoring-service messages without depending on VS Code APIs. */
export interface AuthoringServiceLogger {
	appendLine(message: string): void;
}

/** Supplies the development Java process executable and JPMS module path. */
export interface AuthoringLaunchConfiguration {
	readonly javaExecutable: string;
	readonly modulePath: string;
}

/** Creates the process used for one authoring-service lifetime. */
export interface AuthoringProcessLauncher {
	launch(configuration: AuthoringLaunchConfiguration): ChildProcessWithoutNullStreams;
}

/** Launches the Java authoring-service module directly without an intermediary shell. */
export class NodeAuthoringProcessLauncher implements AuthoringProcessLauncher {
	launch(configuration: AuthoringLaunchConfiguration): ChildProcessWithoutNullStreams {
		return spawn(configuration.javaExecutable, [
			'--module-path', configuration.modulePath,
			'--module', serviceModule
		], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});
	}
}

export type AuthoringServiceState = 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed';

/** Minimal disposable contract used outside the VS Code presentation layer. */
interface Disposable {
	dispose(): void;
}

/** Supervises the one persistent authoring-service process owned by this extension. */
export class AuthoringService implements Disposable {
	private readonly failureListeners = new Set<(error: Error) => void>();
	private stateValue: AuthoringServiceState = 'stopped';
	private starting: Promise<void> | undefined;
	private process: ChildProcessWithoutNullStreams | undefined;
	private client: AuthoringProtocolClient | undefined;
	private disposed = false;

	constructor(
		private readonly configuration: () => AuthoringLaunchConfiguration,
		private readonly launcher: AuthoringProcessLauncher,
		private readonly logger: AuthoringServiceLogger
	) { }

	get state(): AuthoringServiceState {
		return this.stateValue;
	}

	onDidFail(listener: (error: Error) => void): Disposable {
		this.failureListeners.add(listener);
		return { dispose: () => this.failureListeners.delete(listener) };
	}

	async openProject(path: string): Promise<ProjectOpenResultDto> {
		await this.ensureReady();
		try {
			return await this.requireClient().openProject(path);
		} catch (error) {
			throw this.acceptOperationFailure(error);
		}
	}

	async closeProject(): Promise<ProjectCloseResultDto> {
		await this.ensureReady();
		try {
			return await this.requireClient().closeProject();
		} catch (error) {
			throw this.acceptOperationFailure(error);
		}
	}

	async shutdown(): Promise<void> {
		if (this.stateValue === 'stopped' || this.stateValue === 'failed') {
			this.cleanup();
			return;
		}
		if (this.stateValue === 'starting' && this.starting !== undefined) {
			try {
				await this.starting;
			} catch {
				this.cleanup();
				return;
			}
		}

		const process = this.process;
		const client = this.client;
		if (process === undefined || client === undefined) {
			this.cleanup();
			return;
		}
		this.stateValue = 'stopping';
		try {
			const result = await client.shutdown();
			if (!result.shutdown) {
				throw new Error('Authoring service did not acknowledge shutdown');
			}
			await waitForExit(process, shutdownGracePeriodMilliseconds);
		} catch (error) {
			this.logger.appendLine(`Authoring service shutdown failed: ${errorMessage(error)}`);
			process.kill();
		} finally {
			this.cleanup();
			this.logger.appendLine('Authoring service stopped');
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		void this.shutdown();
	}

	private async ensureReady(): Promise<void> {
		if (this.disposed) {
			throw new Error('Authoring service has been disposed');
		}
		if (this.stateValue === 'ready') {
			return;
		}
		if (this.starting !== undefined) {
			return this.starting;
		}
		if (this.stateValue === 'stopping') {
			throw new Error('Authoring service is stopping');
		}

		this.starting = this.start();
		try {
			await this.starting;
		} finally {
			this.starting = undefined;
		}
	}

	private async start(): Promise<void> {
		this.cleanup();
		this.stateValue = 'starting';
		this.logger.appendLine('Starting JScene3D authoring service...');
		try {
			const configuration = this.configuration();
			if (configuration.modulePath.trim().length === 0) {
				throw new Error('Configure jscene3d.authoring.modulePath or JSCENE3D_AUTHORING_SERVICE_MODULE_PATH');
			}
			const process = this.launcher.launch(configuration);
			this.process = process;
			process.stderr.setEncoding('utf8');
			process.stderr.on('data', this.acceptStderr);
			process.once('exit', this.acceptExit);
			process.once('error', this.acceptProcessError);

			const transport = new StreamMessageTransport(process.stdout, process.stdin);
			const client = new AuthoringProtocolClient(new JsonRpcClient(transport));
			this.client = client;
			const initialization = await client.initialize();
			this.validateInitialization(initialization);
			this.stateValue = 'ready';
			this.logger.appendLine(`Authoring service initialized (service ${initialization.serviceVersion}, engine ${initialization.engineVersion})`);
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			this.stateValue = 'failed';
			this.process?.kill();
			this.cleanup(false);
			this.logger.appendLine(`Authoring service failed to start: ${failure.message}`);
			throw failure;
		}
	}

	private validateInitialization(initialization: InitializeResultDto): void {
		if (initialization.protocolVersion.minor > 0) {
			this.logger.appendLine(`Authoring service negotiated protocol 1.${initialization.protocolVersion.minor}`);
		}
	}

	private requireClient(): AuthoringProtocolClient {
		if (this.stateValue !== 'ready' || this.client === undefined) {
			throw new Error('Authoring service is not ready');
		}
		return this.client;
	}

	private readonly acceptStderr = (chunk: Buffer | string): void => {
		const text = chunk.toString().trimEnd();
		if (text.length > 0) {
			for (const line of text.split(/\r?\n/)) {
				this.logger.appendLine(`[Java] ${line}`);
			}
		}
	};

	private readonly acceptExit = (code: number | null, signal: NodeJS.Signals | null): void => {
		const expected = this.stateValue === 'stopping' || this.stateValue === 'stopped';
		if (!expected) {
			const description = signal === null ? `exit code ${code ?? 'unknown'}` : `signal ${signal}`;
			this.fail(new Error(`Authoring service terminated unexpectedly (${description})`));
		}
	};

	private readonly acceptProcessError = (error: Error): void => this.fail(error);

	private fail(error: Error): void {
		if (this.stateValue === 'failed' || this.stateValue === 'stopped') {
			return;
		}
		this.stateValue = 'failed';
		this.logger.appendLine(error.message);
		this.process?.kill();
		this.cleanup(false);
		for (const listener of this.failureListeners) {
			listener(error);
		}
	}

	private acceptOperationFailure(error: unknown): Error {
		const failure = error instanceof Error ? error : new Error(String(error));
		if (!(failure instanceof JsonRpcError)) {
			this.fail(failure);
		}
		return failure;
	}

	private cleanup(resetState = true): void {
		this.client?.dispose();
		this.client = undefined;
		if (this.process !== undefined) {
			this.process.stderr.off('data', this.acceptStderr);
			this.process.off('exit', this.acceptExit);
			this.process.off('error', this.acceptProcessError);
		}
		this.process = undefined;
		if (resetState) {
			this.stateValue = 'stopped';
		}
	}
}

/** Waits for an already-requested process exit up to the supplied timeout. */
function waitForExit(process: ChildProcessWithoutNullStreams, timeout: number): Promise<void> {
	if (process.exitCode !== null || process.signalCode !== null) {
		return Promise.resolve();
	}
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			process.off('exit', acceptExit);
			reject(new Error('Timed out waiting for the authoring service to exit'));
		}, timeout);
		const acceptExit = (): void => {
			clearTimeout(timer);
			resolve();
		};
		process.once('exit', acceptExit);
	});
}

/** Converts an arbitrary caught value to a stable log message. */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
