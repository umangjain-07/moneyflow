import { FirebaseCrudModule } from '../../services/firebase/FirebaseCrudModule';
import { FirebaseUserStateRepository } from '../../services/firebase/FirebaseUserStateRepository';
import { InMemoryFirebaseCrudOperations } from './support/InMemoryFirebaseCrudOperations';

interface PortfolioState {
  portfolioValue: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  updatedAt?: string;
}

const assertEqual = <T>(actual: T, expected: T, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
};

const assertDeepEqual = (actual: unknown, expected: unknown, message: string): void => {
  const actualEncoded = JSON.stringify(actual);
  const expectedEncoded = JSON.stringify(expected);

  if (actualEncoded !== expectedEncoded) {
    throw new Error(`${message}. Expected ${expectedEncoded}, received ${actualEncoded}.`);
  }
};

class PortfolioSyncService {
  constructor(private readonly repository: FirebaseUserStateRepository<PortfolioState>) {}

  async syncPortfolio(userId: string, portfolioValue: number, riskLevel: PortfolioState['riskLevel']): Promise<void> {
    await this.repository.patchState(userId, { portfolioValue, riskLevel });
  }

  async loadPortfolio(userId: string): Promise<PortfolioState | null> {
    return this.repository.pullState(userId);
  }
}

const reuseInAnotherClassTest = async (): Promise<void> => {
  const crud = new FirebaseCrudModule(new InMemoryFirebaseCrudOperations());
  const repository = new FirebaseUserStateRepository<PortfolioState>(crud);
  const portfolioService = new PortfolioSyncService(repository);

  await repository.uploadState('investor-1', { portfolioValue: 12000, riskLevel: 'MEDIUM' });
  await portfolioService.syncPortfolio('investor-1', 15000, 'HIGH');

  const latest = await portfolioService.loadPortfolio('investor-1');
  assertEqual(latest?.portfolioValue, 15000, 'Consumer service should patch value through repository');
  assertEqual(latest?.riskLevel, 'HIGH', 'Consumer service should patch risk level through repository');
  assertEqual(typeof latest?.updatedAt, 'string', 'Repository writes should keep updatedAt timestamp');
};

const repositorySubscriptionTest = async (): Promise<void> => {
  const crud = new FirebaseCrudModule(new InMemoryFirebaseCrudOperations());
  const repository = new FirebaseUserStateRepository<PortfolioState>(crud);
  const seenValues: number[] = [];

  const stop = repository.subscribe('investor-2', (state) => {
    if (state?.portfolioValue !== undefined) {
      seenValues.push(state.portfolioValue);
    }
  });

  await repository.uploadState('investor-2', { portfolioValue: 8000, riskLevel: 'LOW' });
  await repository.patchState('investor-2', { portfolioValue: 9000 });

  stop();
  await repository.patchState('investor-2', { portfolioValue: 10000 });

  assertDeepEqual(
    seenValues,
    [8000, 9000],
    'Subscription should stop receiving updates after unsubscribe is called'
  );
};

export const runFirebaseUserStateRepositoryTests = async (): Promise<void> => {
  await reuseInAnotherClassTest();
  await repositorySubscriptionTest();
  console.log('FirebaseUserStateRepository tests passed');
};
