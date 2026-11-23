/**
 * Dirty Dozen Security Test Specification for Tuvalu: Laguna Chef
 * Documents expected PERMISSION_DENIED outcomes for adversarial payloads.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated profile write',
    collection: 'users/user1',
    operation: 'create',
    authUid: null,
    emailVerified: false,
    payload: { uid: 'user1', displayName: 'Anon', wins: 0 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-user profile update',
    collection: 'users/bob',
    operation: 'update',
    authUid: 'alice',
    emailVerified: true,
    payload: { wins: 99 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'UID spoofing on create',
    collection: 'users/alice',
    operation: 'create',
    authUid: 'alice',
    emailVerified: true,
    payload: { uid: 'bob', displayName: 'Spoofer', wins: 0 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field injection (isAdmin)',
    collection: 'users/alice',
    operation: 'create',
    authUid: 'alice',
    emailVerified: true,
    payload: { uid: 'alice', displayName: 'Alice', wins: 0, isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unverified email write',
    collection: 'users/alice',
    operation: 'create',
    authUid: 'alice',
    emailVerified: false,
    payload: { uid: 'alice', displayName: 'Alice', wins: 0 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client-forged timestamp',
    collection: 'users/alice',
    operation: 'update',
    authUid: 'alice',
    emailVerified: true,
    payload: { updatedAt: '2099-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Win count inflation jump',
    collection: 'users/alice',
    operation: 'update',
    authUid: 'alice',
    emailVerified: true,
    payload: { wins: 999, totalBattles: 999 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable createdAt mutation',
    collection: 'users/alice',
    operation: 'update',
    authUid: 'alice',
    emailVerified: true,
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Oversized displayName poisoning',
    collection: 'users/alice',
    operation: 'update',
    authUid: 'alice',
    emailVerified: true,
    payload: { displayName: 'A'.repeat(200) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Blanket list scraping on users',
    collection: 'users',
    operation: 'list',
    authUid: 'alice',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Leaderboard fake wins mismatch',
    collection: 'leaderboard/alice',
    operation: 'update',
    authUid: 'alice',
    emailVerified: true,
    payload: { wins: 500 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unfiltered leaderboard query exposing non-public entry',
    collection: 'leaderboard',
    operation: 'list',
    authUid: null,
    emailVerified: false,
    expectedResult: 'PERMISSION_DENIED',
  },
];
