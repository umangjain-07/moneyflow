import { FirebaseCrudModule } from './FirebaseCrudModule';

export type UserCloudState = object;

export class FirebaseUserStateRepository<TState extends UserCloudState = Record<string, unknown>> {
  constructor(private readonly crud: FirebaseCrudModule) {}

  async uploadState(userId: string, state: TState): Promise<void> {
    await this.crud.uploadUserState(userId, state);
  }

  async patchState(userId: string, patch: Partial<TState>): Promise<void> {
    await this.crud.updateUserState(userId, patch as Record<string, unknown>);
  }

  async pullState(userId: string): Promise<TState | null> {
    return this.crud.pullUserState<TState>(userId);
  }

  subscribe(
    userId: string,
    onData: (state: TState | null) => void,
    onError?: (error: unknown) => void
  ): () => void {
    return this.crud.subscribeToUserState<TState>(userId, onData, onError);
  }
}
