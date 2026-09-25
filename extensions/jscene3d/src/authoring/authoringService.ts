/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import {
	AuthoringProtocolClient,
	InitializeResultDto,
	ProjectCloseResultDto,
	ProjectOpenResultDto,
	ProjectReplaceResultDto
} from '../protocol/authoringProtocol';
import { JsonRpcClient } from '../protocol/jsonRpcClient';
import { StreamMessageTransport } from '../protocol/messageTransport';

const serviceModule = 'io.github.glynch.jscene3d.editor.authoring.service/io.github.glynch.jscene3d.editor.authoring.process.AuthoringServiceMain';
const maximumStderrLineLength = 64 * 1024;

const defaultTimeouts: AuthoringServiceTimeouts = {
	startupMilliseconds: 3000,
	shutdownAcknowledgementMilliseconds: 3000,
	gracefulExitMilliseconds: 3000,
	terminateExitMilliseconds: 2000,
	killExitMilliseconds: 2000
};

/** Receives operational authoring-service messages without depending on VS Code APIs. */
export interface AuthoringServiceLogger {
	appendLine(message: string): void;
}

/** Supplies the development Java process executable and JPMS module path. */
export interface AuthoringLaunchConfiguration {
	readonly javaExecutable: string;
	readonly modulePath: string;
	readonly clientLanguage: string;
}

/** Child-process surface owned by the authoring-service supervisor. */
export interface AuthoringProcess extends EventEmitter {
	readonly stdin: Writable;
	readonly stdout: Readable;
	readonly stderr: Readable;
	readonly exitCode: number | null;
	readonly signalCode: NodeJS.Signals | null;
	kill(signal?: NodeJS.Signals): boolean;
}

/** Creates the process used for one authoring-service lifetime. */
export interface AuthoringProcessLauncher {
	launch(configuration: AuthoringLaunchConfiguration): AuthoringProcess;
}

/** Bounded lifecycle stages used to stop the owned Java process. */
export interface AuthoringServiceTimeouts {
	readonly startupMilliseconds: number;
	readonly shutdownAcknowledgementMilliseconds: number;
	readonly gracefulExitMilliseconds: number;
	readonly terminateExitMilliseconds: number;
	readonly killExitMilliseconds: number;
}

/** Launches the Java authoring-service module directly without an intermediary shell. */
export class NodeAuthoringProcessLauncher implements AuthoringProcessLauncher {
	launch(configuration: AuthoringLaunchConfiguration): AuthoringProcess {
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
	private shutdownPromise: Promise<void> | undefined;
	private terminationPromise: Promise<void> | undefined;
	private process: AuthoringProcess | undefined;
	private client: AuthoringProtocolClient | undefined;
	private clientFailureSubscription: Disposable | undefined;
	private initialized = false;
	private disposed = false;
	private stderrBuffer = '';

	constructor(
		private readonly configuration: () => AuthoringLaunchConfiguration,
		private readonly launcher: AuthoringProcessLauncher,
		private readonly logger: AuthoringServiceLogger,
		private readonly timeouts: AuthoringServiceTimeouts = defaultTimeouts
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

	async replaceProject(expectedProjectGeneration: number, path: string): Promise<ProjectReplaceResultDto> {
		await this.ensureReady();
		try {
			return await this.requireClient().replaceProject(expectedProjectGeneration, path);
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

	shutdown(): Promise<void> {
		this.shutdownPromise ??= this.performShutdown();
		return this.shutdownPromise;
	}

	dispose(): void {
		void this.shutdown().catch(error => {
			this.logger.appendLine(`Authoring service disposal failed: ${errorMessage(error)}`);
		});
	}

	private async performShutdown(): Promise<void> {
		this.disposed = true;
		const ownedProcess = this.process;
		if (ownedProcess === undefined && this.starting === undefined) {
			this.cleanupConnection();
			this.stateValue = 'stopped';
			return;
		}

		this.stateValue = 'stopping';
		let graceful = false;
		try {
			if (this.starting !== undefined) {
				await withTimeout(
					this.starting,
					this.timeouts.startupMilliseconds,
					'Timed out waiting for authoring service startup during shutdown'
				);
			}
			const process = this.process;
			const client = this.client;
			if (process !== undefined && client !== undefined && this.initialized) {
				const result = await withTimeout(
					client.shutdown(),
					this.timeouts.shutdownAcknowledgementMilliseconds,
					'Timed out waiting for the authoring service shutdown acknowledgement'
				);
				if (!result.shutdown) {
					throw new Error('Authoring service did not acknowledge shutdown');
				}
				await waitForExit(process, this.timeouts.gracefulExitMilliseconds);
				graceful = true;
			}
		} catch (error) {
			this.logger.appendLine(`Authoring service shutdown failed: ${errorMessage(error)}`);
		}

		try {
			if (!graceful && this.process !== undefined) {
				await this.terminateOwnedProcess(this.process);
			}
			if (this.terminationPromise !== undefined) {
				await this.terminationPromise;
			}
		} catch (error) {
			this.stateValue = 'failed';
			this.logger.appendLine(`Authoring service could not be reaped: ${errorMessage(error)}`);
			throw error;
		}
		this.cleanupConnection();
		this.flushStderr();
		this.stateValue = 'stopped';
		this.logger.appendLine('Authoring service stopped');
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
		if (this.stateValue === 'failed') {
			throw new Error('Authoring service has failed');
		}

		const starting = this.start();
		this.starting = starting;
		try {
			await starting;
		} finally {
			if (this.starting === starting) {
				this.starting = undefined;
			}
		}
	}

	private async start(): Promise<void> {
		this.cleanupConnection();
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
			this.clientFailureSubscription = client.onDidFail(this.acceptConnectionFailure);
			const initialization = await client.initialize(configuration.clientLanguage);
			this.validateInitialization(initialization);
			this.initialized = true;
			if (!this.disposed) {
				this.stateValue = 'ready';
				this.logger.appendLine(`Authoring service initialized (service ${initialization.serviceVersion}, engine ${initialization.engineVersion})`);
			}
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			if (!isFailureOrShutdown(this.stateValue)) {
				this.fail(failure, `Authoring service failed to start: ${failure.message}`);
			}
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
		this.stderrBuffer += chunk.toString();
		let lineEnd = this.stderrBuffer.indexOf('\n');
		while (lineEnd >= 0) {
			this.writeStderrLine(this.stderrBuffer.slice(0, lineEnd));
			this.stderrBuffer = this.stderrBuffer.slice(lineEnd + 1);
			lineEnd = this.stderrBuffer.indexOf('\n');
		}
		while (this.stderrBuffer.length > maximumStderrLineLength) {
			this.writeStderrLine(this.stderrBuffer.slice(0, maximumStderrLineLength));
			this.stderrBuffer = this.stderrBuffer.slice(maximumStderrLineLength);
		}
	};

	private readonly acceptExit = (code: number | null, signal: NodeJS.Signals | null): void => {
		this.flushStderr();
		const process = this.process;
		if (process !== undefined) {
			this.releaseProcess(process);
		}
		const expected = this.stateValue === 'stopping' || this.stateValue === 'stopped' || this.stateValue === 'failed';
		if (!expected) {
			const description = signal === null ? `exit code ${code ?? 'unknown'}` : `signal ${signal}`;
			this.fail(new Error(`Authoring service terminated unexpectedly (${description})`));
		}
	};

	private readonly acceptProcessError = (error: Error): void => this.fail(error);

	private readonly acceptConnectionFailure = (error: Error): void => this.fail(error);

	private fail(error: Error, logMessage = error.message): void {
		if (this.stateValue === 'failed' || this.stateValue === 'stopped' || this.stateValue === 'stopping') {
			return;
		}
		this.stateValue = 'failed';
		this.logger.appendLine(logMessage);
		this.cleanupConnection();
		for (const listener of Array.from(this.failureListeners)) {
			listener(error);
		}
		if (this.process !== undefined) {
			void this.terminateOwnedProcess(this.process).catch(terminationError => {
				this.logger.appendLine(`Authoring service termination failed: ${errorMessage(terminationError)}`);
			});
		}
	}

	private acceptOperationFailure(error: unknown): Error {
		const failure = error instanceof Error ? error : new Error(String(error));
		// Stage 1 domain rejections are successful result DTOs. Any thrown request failure means
		// the process or protocol connection can no longer be treated as authoritative.
		this.fail(failure);
		return failure;
	}

	private terminateOwnedProcess(process: AuthoringProcess): Promise<void> {
		if (this.terminationPromise !== undefined) {
			return this.terminationPromise;
		}
		const termination = this.performTermination(process);
		this.terminationPromise = termination;
		const clearTermination = (): void => {
			if (this.terminationPromise === termination) {
				this.terminationPromise = undefined;
			}
		};
		void termination.then(clearTermination, clearTermination);
		return termination;
	}

	private async performTermination(process: AuthoringProcess): Promise<void> {
		this.cleanupConnection();
		if (hasExited(process)) {
			this.releaseProcess(process);
			return;
		}
		process.kill('SIGTERM');
		try {
			await waitForExit(process, this.timeouts.terminateExitMilliseconds);
		} catch {
			if (!hasExited(process)) {
				process.kill('SIGKILL');
			}
			await waitForExit(process, this.timeouts.killExitMilliseconds);
		}
		this.releaseProcess(process);
	}

	private cleanupConnection(): void {
		this.clientFailureSubscription?.dispose();
		this.clientFailureSubscription = undefined;
		this.client?.dispose();
		this.client = undefined;
		this.initialized = false;
	}

	private releaseProcess(process: AuthoringProcess): void {
		if (this.process !== process || !hasExited(process)) {
			return;
		}
		process.stderr.off('data', this.acceptStderr);
		process.off('exit', this.acceptExit);
		process.off('error', this.acceptProcessError);
		this.process = undefined;
	}

	private writeStderrLine(line: string): void {
		const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
		if (normalized.length > 0) {
			this.logger.appendLine(`[Java] ${normalized}`);
		}
	}

	private flushStderr(): void {
		if (this.stderrBuffer.length > 0) {
			this.writeStderrLine(this.stderrBuffer);
			this.stderrBuffer = '';
		}
	}
}

function hasExited(process: AuthoringProcess): boolean {
	return process.exitCode !== null || process.signalCode !== null;
}

function isFailureOrShutdown(state: AuthoringServiceState): boolean {
	return state === 'failed' || state === 'stopping' || state === 'stopped';
}

function waitForExit(process: AuthoringProcess, timeout: number): Promise<void> {
	if (hasExited(process)) {
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

function withTimeout<T>(operation: Promise<T>, timeout: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), timeout);
		operation.then(
			value => {
				clearTimeout(timer);
				resolve(value);
			},
			error => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
