export interface FirebaseCrudOperations {
  create(path: string, payload: unknown): Promise<void>;
  read<T>(path: string): Promise<T | null>;
  update(path: string, payload: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  subscribe<T>(
    path: string,
    onData: (payload: T | null) => void,
    onError?: (error: unknown) => void
  ): () => void;
}

export class FirebaseCrudModule {
  constructor(private readonly operations: FirebaseCrudOperations) {}

  async createDocument<T>(path: string, payload: T): Promise<void> {
    this.ensurePath(path);
    await this.operations.create(path, payload);
  }

  async getDocument<T>(path: string): Promise<T | null> {
    this.ensurePath(path);
    return this.operations.read<T>(path);
  }

  async updateDocument(path: string, payload: Record<string, unknown>): Promise<void> {
    this.ensurePath(path);
    await this.operations.update(path, payload);
  }

  async deleteDocument(path: string): Promise<void> {
    this.ensurePath(path);
    await this.operations.remove(path);
  }

  subscribeToDocument<T>(
    path: string,
    onData: (payload: T | null) => void,
    onError?: (error: unknown) => void
  ): () => void {
    this.ensurePath(path);
    return this.operations.subscribe(path, onData, onError);
  }

  async uploadUserState(userId: string, state: Record<string, unknown>): Promise<void> {
    this.ensureIdentifier(userId, 'userId');
    await this.updateUserState(userId, state);
  }

  async updateUserState(userId: string, patch: Record<string, unknown>): Promise<void> {
    this.ensureIdentifier(userId, 'userId');

    await this.updateDocument(this.userPath(userId), {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async pullUserState<T>(userId: string): Promise<T | null> {
    this.ensureIdentifier(userId, 'userId');
    return this.getDocument<T>(this.userPath(userId));
  }

  subscribeToUserState<T>(
    userId: string,
    onData: (state: T | null) => void,
    onError?: (error: unknown) => void
  ): () => void {
    this.ensureIdentifier(userId, 'userId');
    return this.subscribeToDocument<T>(this.userPath(userId), onData, onError);
  }

  private userPath(userId: string): string {
    return `users/${userId}`;
  }

  private ensurePath(path: string): void {
    if (!path || !path.trim()) {
      throw new Error('Firebase path must be a non-empty string.');
    }
  }

  private ensureIdentifier(value: string, label: string): void {
    if (!value || !value.trim()) {
      throw new Error(`${label} must be a non-empty string.`);
    }
  }
}
