export interface LeaseStore {
  acquireLease(
    accountKey: string,
    owner: string,
    nowEpochSeconds: number,
    leaseUntilEpochSeconds: number,
  ): Promise<boolean>;
  releaseLease(accountKey: string, owner: string): Promise<boolean>;
}

export type LeaseRunResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

export async function runWithLease<T>(
  store: LeaseStore,
  accountKey: string,
  owner: string,
  nowEpochSeconds: number,
  leaseDurationSeconds: number,
  operation: () => Promise<T>,
): Promise<LeaseRunResult<T>> {
  const acquired = await store.acquireLease(
    accountKey,
    owner,
    nowEpochSeconds,
    nowEpochSeconds + leaseDurationSeconds,
  );
  if (!acquired) return { acquired: false };

  try {
    return { acquired: true, value: await operation() };
  } finally {
    await store.releaseLease(accountKey, owner);
  }
}
