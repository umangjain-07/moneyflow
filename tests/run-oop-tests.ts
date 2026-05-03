import { runFirebaseCrudModuleTests } from './firebase/FirebaseCrudModule.test';
import { runFirebaseUserStateRepositoryTests } from './firebase/FirebaseUserStateRepository.test';

const run = async (): Promise<void> => {
  await runFirebaseCrudModuleTests();
  await runFirebaseUserStateRepositoryTests();
  console.log('All OOP module tests passed');
};

run().catch((error) => {
  console.error('OOP test suite failed:', error);
  throw error;
});
