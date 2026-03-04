import type { CancellationTokenLike } from "@tide/shared";

/**
 * CancellationToken — one per LLM request / tool execution.
 * Listeners are called immediately if the token is already cancelled.
 */
export class CancellationToken implements CancellationTokenLike {
  private _cancelled = false;
  private listeners: Array<() => void> = [];

  get isCancelled(): boolean {
    return this._cancelled;
  }

  /** Signal cancellation. All registered listeners are invoked once. */
  cancel(): void {
    if (this._cancelled) return;
    this._cancelled = true;
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error("[CancellationToken] listener error:", e);
      }
    }
    this.listeners = [];
  }

  /** Register a callback. If already cancelled, fires immediately. */
  onCancel(fn: () => void): void {
    if (this._cancelled) {
      fn();
      return;
    }
    this.listeners.push(fn);
  }

  /** Throw if this token has been cancelled. */
  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new CancellationError();
    }
  }
}

export class CancellationError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "CancellationError";
  }
}
