// @ts-ignore
import { getDatabase, get, onValue, ref, remove, set, update } from 'firebase/database';
import type { FirebaseCrudOperations } from './FirebaseCrudModule';

export class FirebaseRealtimeAdapter implements FirebaseCrudOperations {
  private readonly database;

  constructor(app: any) {
    this.database = getDatabase(app);
  }

  async create(path: string, payload: unknown): Promise<void> {
    const sanitized = this.sanitizePayload(payload);
    this.log('create', path, sanitized);
    await set(this.node(path), sanitized);
  }

  async read<T>(path: string): Promise<T | null> {
    const snapshot = await get(this.node(path));
    const value = snapshot.exists() ? (snapshot.val() as T) : null;
    this.log('read', path, value);
    return value;
  }

  async update(path: string, payload: Record<string, unknown>): Promise<void> {
    const sanitized = this.sanitizePayload(payload) as Record<string, unknown>;
    this.log('update', path, sanitized);
    await update(this.node(path), sanitized);
  }

  async remove(path: string): Promise<void> {
    this.log('remove', path);
    await remove(this.node(path));
  }

  subscribe<T>(
    path: string,
    onData: (payload: T | null) => void,
    onError?: (error: unknown) => void
  ): () => void {
    this.log('subscribe', path);
    return onValue(
      this.node(path),
      (snapshot: any) => {
        const value = snapshot.exists() ? (snapshot.val() as T) : null;
        this.log('subscribe-data', path, value);
        onData(value);
      },
      onError
    );
  }

  private node(path: string) {
    return ref(this.database, path);
  }

  private log(operation: string, path: string, payload?: unknown) {
    if (payload === undefined) {
      console.log(`[Firebase:${operation}] ${path}`);
      return;
    }

    console.log(`[Firebase:${operation}] ${path}`, payload);
  }

  private sanitizePayload(value: unknown): unknown {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizePayload(item))
        .filter((item) => item !== undefined);
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
        if (val === undefined) {
          return;
        }
        const sanitized = this.sanitizePayload(val);
        if (sanitized !== undefined) {
          result[key] = sanitized;
        }
      });
      return result;
    }

    return value;
  }
}
