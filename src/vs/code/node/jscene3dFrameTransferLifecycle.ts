/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IJScene3DFrameTransfer {
	readonly lifecycle: JScene3DFrameTransferLifecycle;
	readonly presentationGeneration: number;
	readonly surfaceGeneration: number;
	readonly frameNumber: number;
}

export type JScene3DFrameTransferDisposition = 'present' | 'interrupted' | 'fail';

/** Classifies completion of the single Code OSS frame transfer owned by one viewport session. */
export class JScene3DFrameTransferLifecycle {
	private generation = 0;
	private pending: IJScene3DFrameTransfer | undefined;

	/** Begins the next transfer using the current presentation generation. */
	begin(surfaceGeneration: number, frameNumber: number): IJScene3DFrameTransfer {
		if (this.pending) {
			throw new Error('A JScene3D frame transfer is already pending');
		}
		this.pending = {
			lifecycle: this,
			presentationGeneration: this.generation,
			surfaceGeneration,
			frameNumber
		};
		return this.pending;
	}

	/** Invalidates any transfer begun before a pause or presentation-surface transition. */
	invalidate(): void {
		this.generation++;
	}

	/** Classifies one completion and relinquishes this lifecycle's pending-transfer slot. */
	settle(transfer: IJScene3DFrameTransfer, surfaceGeneration: number, succeeded: boolean): JScene3DFrameTransferDisposition {
		if (transfer.lifecycle !== this || this.pending !== transfer) {
			return 'interrupted';
		}
		this.pending = undefined;
		if (transfer.presentationGeneration !== this.generation || transfer.surfaceGeneration !== surfaceGeneration) {
			return 'interrupted';
		}
		return succeeded ? 'present' : 'fail';
	}
}
