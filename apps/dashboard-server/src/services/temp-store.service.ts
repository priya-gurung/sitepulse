// ------------------------------------------------------------
// In-Memory TTL Store
//
// Lightweight key→value store with per-entry expiry. Used for:
//   • Pending OTP registrations (5-min TTL)
//   • Password reset tokens    (15-min TTL)
//
// For multi-replica / persistent needs, swap this for Redis
// (the public API would remain unchanged).
// ------------------------------------------------------------

interface StoreEntry<T> {
  value: T;
  expiresAt: number;
}

export class TempStore<T> {
  private store = new Map<string, StoreEntry<T>>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  /**
   * @param cleanupIntervalMs  How often to sweep expired entries (default 60 s).
   */
  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupTimer = setInterval(() => this.sweep(), cleanupIntervalMs);
    this.cleanupTimer.unref(); // don't prevent Node from exiting
  }

  /** Store a value with a TTL in milliseconds. */
  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Retrieve a value if it exists and hasn't expired. */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Check existence (respects TTL). */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Explicitly delete an entry. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Remove all expired entries. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /** Tear down the periodic sweep (for graceful shutdown / tests). */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.store.clear();
  }
}

// ------------------------------------------------------------
// Shared instances
// ------------------------------------------------------------

export interface PendingRegistration {
  name: string;
  email: string;
  passwordHash: string;
  otp: string;
}

export interface ResetTokenEntry {
  email: string;
}

/** Pending OTP registrations, keyed by email. */
export const pendingRegistrations = new TempStore<PendingRegistration>();

/** Password reset tokens, keyed by the hex token string. */
export const resetTokens = new TempStore<ResetTokenEntry>();
