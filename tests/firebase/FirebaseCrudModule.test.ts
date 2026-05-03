import { FirebaseCrudModule } from '../../services/firebase/FirebaseCrudModule';
import { InMemoryFirebaseCrudOperations } from './support/InMemoryFirebaseCrudOperations';

const assertTrue = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = <T>(actual: T, expected: T, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
};

const assertRejects = async (run: () => Promise<unknown>, expectedMessagePart: string): Promise<void> => {
  let rejected = false;

  try {
    await run();
  } catch (error: any) {
    rejected = true;
    const message = String(error?.message || error);
    assertTrue(
      message.includes(expectedMessagePart),
      `Expected error message to include '${expectedMessagePart}', received '${message}'.`
    );
  }

  assertTrue(rejected, 'Expected operation to reject.');
};

const crudLifecycleTest = async (): Promise<void> => {
  const module = new FirebaseCrudModule(new InMemoryFirebaseCrudOperations());
  const path = 'users/user-a/profile';

  await module.createDocument(path, { username: 'alice' });
  await module.updateDocument(path, { email: 'alice@example.com' });

  const value = await module.getDocument<{ username: string; email: string }>(path);
  assertEqual(value?.username, 'alice', 'Username should be stored after create operation');
  assertEqual(value?.email, 'alice@example.com', 'Email should be merged after update operation');

  await module.deleteDocument(path);
  const removed = await module.getDocument(path);
  assertEqual(removed, null, 'Deleted document should return null');
};

const validationTest = async (): Promise<void> => {
  const module = new FirebaseCrudModule(new InMemoryFirebaseCrudOperations());

  await assertRejects(() => module.createDocument('', { ok: true }), 'non-empty string');
  await assertRejects(() => module.pullUserState('   '), 'userId must be a non-empty string');
};

const subscriptionTest = async (): Promise<void> => {
  const module = new FirebaseCrudModule(new InMemoryFirebaseCrudOperations());
  const observed: Array<{ balance?: number } | null> = [];

  const unsubscribe = module.subscribeToUserState<{ balance: number }>('user-b', (state) => {
    observed.push(state);
  });

  await module.uploadUserState('user-b', { balance: 100 });
  await module.updateUserState('user-b', { balance: 250 });

  unsubscribe();
  await module.updateUserState('user-b', { balance: 500 });

  assertEqual(observed.length, 3, 'Subscriber should receive initial, upload, and patch events');
  assertEqual(observed[0], null, 'Initial subscription callback should receive null state');
  assertEqual(observed[1]?.balance, 100, 'Upload should publish the first balance value');
  assertEqual(observed[2]?.balance, 250, 'Patch should publish the updated balance value');

  const savedState = await module.pullUserState<{ balance: number; updatedAt: string }>('user-b');
  assertEqual(savedState?.balance, 500, 'Storage should still update after unsubscribe');
  assertEqual(typeof savedState?.updatedAt, 'string', 'State writes should include updatedAt timestamp');
};

export const runFirebaseCrudModuleTests = async (): Promise<void> => {
  await crudLifecycleTest();
  await validationTest();
  await subscriptionTest();
  console.log('FirebaseCrudModule tests passed');
};
