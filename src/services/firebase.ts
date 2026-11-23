import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { getChefTitleForWins } from '../data/tuvaluData';
import { FishTier, LeaderboardEntryData, UserProfileData } from '../types/game';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function sanitizeDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, 40);
  return trimmed.length > 0 ? trimmed : '투발루 셰프';
}

function clampInt(val: number, min: number, max: number): number {
  const rounded = Math.round(Number.isFinite(val) ? val : min);
  return Math.max(min, Math.min(max, rounded));
}

const VALID_TIERS: ReadonlySet<string> = new Set([
  'none',
  'common',
  'uncommon',
  'epic',
  'legendary',
  'mythic',
]);

function sanitizeTier(tier: string): FishTier | 'none' {
  return VALID_TIERS.has(tier) ? (tier as FishTier | 'none') : 'none';
}

export async function loadUserProfile(uid: string): Promise<UserProfileData | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      uid: String(data.uid ?? uid),
      displayName: String(data.displayName ?? '투발루 셰프'),
      wins: Number(data.wins ?? 0),
      losses: Number(data.losses ?? 0),
      totalBattles: Number(data.totalBattles ?? 0),
      coins: Number(data.coins ?? 80),
      fishCaughtCount: Number(data.fishCaughtCount ?? 0),
      bestDishScore: Number(data.bestDishScore ?? 0),
      rarestFishTier: sanitizeTier(String(data.rarestFishTier ?? 'none')),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserProfile(
  profile: UserProfileData,
  isNew: boolean,
  alsoPublishRank = false,
): Promise<void> {
  const uid = profile.uid;
  const userPath = `users/${uid}`;
  const wins = clampInt(profile.wins, 0, 100000);
  const losses = clampInt(profile.losses, 0, 100000);
  const totalBattles = wins + losses;
  const displayName = sanitizeDisplayName(profile.displayName);
  const coins = clampInt(profile.coins, 0, 10000000);
  const fishCaughtCount = clampInt(profile.fishCaughtCount, 0, 1000000);
  const bestDishScore = clampInt(profile.bestDishScore, 0, 1000);
  const rarestFishTier = sanitizeTier(profile.rarestFishTier);

  try {
    const batch = writeBatch(db);
    const userRef = doc(db, 'users', uid);

    if (isNew) {
      batch.set(userRef, {
        uid,
        displayName,
        wins,
        losses,
        totalBattles,
        coins,
        fishCaughtCount,
        bestDishScore,
        rarestFishTier,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(userRef, {
        displayName,
        wins,
        losses,
        totalBattles,
        coins,
        fishCaughtCount,
        bestDishScore,
        rarestFishTier,
        updatedAt: serverTimestamp(),
      });
    }

    if (alsoPublishRank) {
      const rankRef = doc(db, 'leaderboard', uid);
      const existingRank = await getDoc(rankRef);
      const chefTitle = getChefTitleForWins(wins).slice(0, 40);

      if (!existingRank.exists()) {
        batch.set(rankRef, {
          uid,
          displayName,
          chefTitle,
          wins,
          totalBattles,
          bestDishScore,
          rarestFishTier,
          isPublic: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(rankRef, {
          displayName,
          chefTitle,
          wins,
          totalBattles,
          bestDishScore,
          rarestFishTier,
          isPublic: true,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, userPath);
  }
}

const TIER_RANK: Record<string, number> = {
  none: 0,
  common: 1,
  uncommon: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export async function publishToLeaderboard(profile: UserProfileData): Promise<UserProfileData> {
  const uid = auth.currentUser?.uid || profile.uid;
  const rankPath = `leaderboard/${uid}`;
  const displayName = sanitizeDisplayName(profile.displayName);

  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const rankRef = doc(db, 'leaderboard', uid);
    const rankSnap = await getDoc(rankRef);

    const existingUser = userSnap.exists() ? userSnap.data() : null;
    const wins = clampInt(Math.max(profile.wins, Number(existingUser?.wins ?? 0)), 0, 100000);
    const losses = clampInt(Math.max(profile.losses, Number(existingUser?.losses ?? 0)), 0, 100000);
    const totalBattles = wins + losses;
    const coins = clampInt(Math.max(profile.coins, Number(existingUser?.coins ?? 0)), 0, 10000000);
    const fishCaughtCount = clampInt(
      Math.max(profile.fishCaughtCount, Number(existingUser?.fishCaughtCount ?? 0)),
      0,
      1000000,
    );
    const bestDishScore = clampInt(
      Math.max(profile.bestDishScore, Number(existingUser?.bestDishScore ?? 0)),
      0,
      1000,
    );

    const localTier = sanitizeTier(profile.rarestFishTier);
    const cloudTier = sanitizeTier(String(existingUser?.rarestFishTier ?? 'none'));
    const rarestFishTier =
      (TIER_RANK[localTier] ?? 0) >= (TIER_RANK[cloudTier] ?? 0) ? localTier : cloudTier;
    const chefTitle = getChefTitleForWins(wins).slice(0, 40);

    const batch = writeBatch(db);
    if (!userSnap.exists()) {
      batch.set(userRef, {
        uid,
        displayName,
        wins,
        losses,
        totalBattles,
        coins,
        fishCaughtCount,
        bestDishScore,
        rarestFishTier,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(userRef, {
        displayName,
        wins,
        losses,
        totalBattles,
        coins,
        fishCaughtCount,
        bestDishScore,
        rarestFishTier,
        updatedAt: serverTimestamp(),
      });
    }

    if (!rankSnap.exists()) {
      batch.set(rankRef, {
        uid,
        displayName,
        chefTitle,
        wins,
        totalBattles,
        bestDishScore,
        rarestFishTier,
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(rankRef, {
        displayName,
        chefTitle,
        wins,
        totalBattles,
        bestDishScore,
        rarestFishTier,
        isPublic: true,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    return {
      uid,
      displayName,
      wins,
      losses,
      totalBattles,
      coins,
      fishCaughtCount,
      bestDishScore,
      rarestFishTier,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, rankPath);
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntryData[]> {
  const path = 'leaderboard';
  try {
    const q = query(
      collection(db, 'leaderboard'),
      where('isPublic', '==', true),
      limit(50),
    );
    const snap = await getDocs(q);
    const entries: LeaderboardEntryData[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: String(data.uid ?? d.id),
        displayName: String(data.displayName ?? '투발루 셰프'),
        chefTitle: String(data.chefTitle ?? '푸나푸티 셰프'),
        wins: Number(data.wins ?? 0),
        totalBattles: Number(data.totalBattles ?? 0),
        bestDishScore: Number(data.bestDishScore ?? 0),
        rarestFishTier: sanitizeTier(String(data.rarestFishTier ?? 'none')),
        isPublic: Boolean(data.isPublic),
      };
    });
    entries.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.bestDishScore - a.bestDishScore;
    });
    return entries.slice(0, 25);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
