import type { FirebaseCrudOperations } from '../../../services/firebase/FirebaseCrudModule';

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

export class InMemoryFirebaseCrudOperations implements FirebaseCrudOperations {
  private readonly store = new Map<string, unknown>();
  private readonly subscribers = new Map<string, Set<(payload: unknown) => void>>();

  async create(path: string, payload: unknown): Promise<void> {
    this.store.set(path, clone(payload));
    this.emit(path);
  }

  async read<T>(path: string): Promise<T | null> {
    if (!this.store.has(path)) {
      return null;
    }

    return clone(this.store.get(path) as T);
  }

  async update(path: string, payload: Record<string, unknown>): Promise<void> {
    const current = (this.store.get(path) as Record<string, unknown> | undefined) ?? {};
    const merged = { ...clone(current), ...clone(payload) };

    this.store.set(path, merged);
    this.emit(path);
  }

  async remove(path: string): Promise<void> {
    this.store.delete(path);
    this.emit(path);
  }

  subscribe<T>(
    path: string,
    onData: (payload: T | null) => void,
    _onError?: (error: unknown) => void
  ): () => void {
    const listeners = this.subscribers.get(path) ?? new Set<(payload: unknown) => void>();

    const listener = (payload: unknown) => {
      onData(payload === null ? null : (clone(payload) as T));
    };

    listeners.add(listener);
    this.subscribers.set(path, listeners);

    listener(this.store.has(path) ? this.store.get(path) ?? null : null);

    return () => {
      const active = this.subscribers.get(path);
      if (!active) {
        return;
      }

      active.delete(listener);
      if (active.size === 0) {
        this.subscribers.delete(path);
      }
    };
  }

  private emit(path: string): void {
    const listeners = this.subscribers.get(path);
    if (!listeners) {
      return;
    }

    const payload = this.store.has(path) ? this.store.get(path) ?? null : null;
    listeners.forEach((listener) => listener(payload));
  }
}
