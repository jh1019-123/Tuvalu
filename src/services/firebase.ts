import { initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { getChefTitleForWins } from '../data/tuvaluData';
import {
  BattlePlayerSlot,
  BattleRoomData,
  FishTier,
  LeaderboardEntryData,
  RealtimePlayerStage,
  RealtimeRoomStatus,
  UserProfileData,
} from '../types/game';

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

export class AuthSignInError extends Error {
  code: string;
  needsExternalBrowser: boolean;

  constructor(message: string, code = 'auth/unknown', needsExternalBrowser = false) {
    super(message);
    this.name = 'AuthSignInError';
    this.code = code;
    this.needsExternalBrowser = needsExternalBrowser;
  }
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(ua);
}

export function isEmbeddedFrame(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function extractAuthErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'auth/unknown');
  }
  return 'auth/unknown';
}

function buildFriendlyAuthError(error: unknown): AuthSignInError {
  if (error instanceof AuthSignInError) return error;
  const code = extractAuthErrorCode(error);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain') {
    return new AuthSignInError(
      `현재 주소(${host || '현재 도메인'})가 Firebase 승인 도메인에 등록되어 있지 않아 로그인 창을 열 수 없습니다. Firebase Console → Authentication → Settings → 승인된 도메인에 "${host}"를 추가해 주세요.`,
      code,
      true,
    );
  }
  if (code === 'auth/popup-blocked') {
    return new AuthSignInError(
      '브라우저에서 로그인 팝업이 차단되었습니다. 팝업 차단을 해제하거나 아래 "새 탭에서 열기"로 다시 로그인해 주세요.',
      code,
      true,
    );
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return new AuthSignInError(
      '현재 브라우저/인앱 환경에서는 Google 로그인 팝업이 지원되지 않습니다. Chrome 또는 Safari 등 기본 브라우저로 열어 로그인해 주세요.',
      code,
      true,
    );
  }
  if (code === 'auth/popup-closed-by-user') {
    return new AuthSignInError(
      '로그인 창이 완료되기 전에 닫혔습니다. 다시 시도해 주세요.',
      code,
      false,
    );
  }
  if (code === 'auth/cancelled-popup-request') {
    return new AuthSignInError(
      '이미 진행 중인 로그인 요청이 있어 취소되었습니다. 잠시 후 다시 시도해 주세요.',
      code,
      false,
    );
  }
  if (code === 'auth/network-request-failed') {
    return new AuthSignInError(
      '네트워크 연결 오류로 로그인에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
      code,
      false,
    );
  }
  const rawMsg = error instanceof Error ? error.message : String(error);
  return new AuthSignInError(`Google 로그인에 실패했습니다. (${code}: ${rawMsg.slice(0, 80)})`, code, false);
}

export async function resolveRedirectSignIn(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch (error) {
    throw buildFriendlyAuthError(error);
  }
}

export async function signInWithGoogle(): Promise<User> {
  if (isInAppBrowser()) {
    throw new AuthSignInError(
      '카카오톡·인스타그램 등 인앱 브라우저에서는 Google 로그인이 차단됩니다. 우측 메뉴(⋯)에서 "다른 브라우저로 열기(Chrome/Safari)" 또는 링크 복사로 열어주세요.',
      'auth/in-app-browser',
      true,
    );
  }

  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (error) {
    const code = extractAuthErrorCode(error);
    if (
      (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') &&
      !isEmbeddedFrame()
    ) {
      // Fallback to redirect flow only when running in a top-level browser window
      await signInWithRedirect(auth, googleProvider);
      throw new AuthSignInError(
        'Google 로그인 페이지로 이동합니다...',
        'auth/redirect-started',
        false,
      );
    }
    throw buildFriendlyAuthError(error);
  }
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

// === Real-Time 1v1 Cooking Battle Rooms ===

export class BattleRoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleRoomError';
  }
}

export function formatBattleErrorKo(err: unknown, fallback: string): string {
  if (err instanceof BattleRoomError || err instanceof AuthSignInError) {
    return err.message;
  }
  if (err instanceof Error) {
    let rawError = err.message;
    try {
      const parsed = JSON.parse(err.message) as Partial<FirestoreErrorInfo>;
      if (parsed && typeof parsed.error === 'string') {
        rawError = parsed.error;
      }
    } catch {
      // not JSON
    }
    const lower = rawError.toLowerCase();
    if (lower.includes('missing or insufficient permissions') || lower.includes('permission-denied')) {
      return '권한이 부족하거나 로그인 인증이 확인되지 않았습니다. 로그아웃 후 다시 Google 로그인해 주세요.';
    }
    if (lower.includes('quota exceeded')) {
      return '오늘의 무료 서버 사용량을 초과했습니다. 내일 한도가 초기화됩니다.';
    }
    if (lower.includes('requires an index') || lower.includes('failed-precondition')) {
      return '매칭 검색 인덱스를 준비 중입니다. 잠시 후 다시 시도하거나 방 코드 만들기를 이용해 주세요.';
    }
    if (lower.includes('offline') || lower.includes('unavailable') || lower.includes('network')) {
      return '서버 연결이 원활하지 않습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    }
    if (rawError) {
      return `${fallback} (${rawError.slice(0, 90)})`;
    }
  }
  return fallback;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function toMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: unknown }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function buildEmptyBattleSlot(): BattlePlayerSlot {
  return {
    uid: '',
    displayName: '',
    chefTitle: '',
    wins: 0,
    losses: 0,
    bestDishScore: 0,
    rarestFishTier: 'none',
    ready: false,
    fishSpeciesId: '',
    fishWeightKg: 0,
    ingredientIds: [],
    stage: 'idle',
    washScore: 0,
    prepScore: 0,
    cookScore: 0,
    perfectionScore: 0,
    palateScore: 0,
    totalScore: 0,
    dishNameKo: '',
  };
}

export function buildPlayerSlotFromProfile(profile: UserProfileData): BattlePlayerSlot {
  const wins = clampInt(profile.wins, 0, 100000);
  const losses = clampInt(profile.losses, 0, 100000);
  return {
    uid: profile.uid,
    displayName: sanitizeDisplayName(profile.displayName),
    chefTitle: getChefTitleForWins(wins).slice(0, 40),
    wins,
    losses,
    bestDishScore: clampInt(profile.bestDishScore, 0, 1000),
    rarestFishTier: sanitizeTier(profile.rarestFishTier),
    ready: false,
    fishSpeciesId: '',
    fishWeightKg: 0,
    ingredientIds: [],
    stage: 'idle',
    washScore: 0,
    prepScore: 0,
    cookScore: 0,
    perfectionScore: 0,
    palateScore: 0,
    totalScore: 0,
    dishNameKo: '',
  };
}

function sanitizeSlot(raw: Record<string, unknown> | undefined): BattlePlayerSlot {
  const d = raw ?? {};
  const rawIngs = Array.isArray(d.ingredientIds) ? d.ingredientIds : [];
  const ingredientIds = rawIngs
    .map((x) => String(x ?? '').slice(0, 60))
    .filter((x) => x.length > 0)
    .slice(0, 3);
  const stageStr = String(d.stage ?? 'idle');
  const stage: RealtimePlayerStage =
    stageStr === 'intro' ||
    stageStr === 'wash' ||
    stageStr === 'prep' ||
    stageStr === 'cook' ||
    stageStr === 'done'
      ? stageStr
      : 'idle';

  return {
    uid: String(d.uid ?? ''),
    displayName: String(d.displayName ?? ''),
    chefTitle: String(d.chefTitle ?? ''),
    wins: clampInt(Number(d.wins ?? 0), 0, 100000),
    losses: clampInt(Number(d.losses ?? 0), 0, 100000),
    bestDishScore: clampInt(Number(d.bestDishScore ?? 0), 0, 1000),
    rarestFishTier: sanitizeTier(String(d.rarestFishTier ?? 'none')),
    ready: Boolean(d.ready),
    fishSpeciesId: String(d.fishSpeciesId ?? '').slice(0, 60),
    fishWeightKg: Math.max(0, Math.min(500, Number(d.fishWeightKg ?? 0) || 0)),
    ingredientIds,
    stage,
    washScore: clampInt(Number(d.washScore ?? 0), 0, 100),
    prepScore: clampInt(Number(d.prepScore ?? 0), 0, 100),
    cookScore: clampInt(Number(d.cookScore ?? 0), 0, 100),
    perfectionScore: clampInt(Number(d.perfectionScore ?? 0), 0, 100),
    palateScore: clampInt(Number(d.palateScore ?? 0), 0, 100),
    totalScore: clampInt(Number(d.totalScore ?? 0), 0, 200),
    dishNameKo: String(d.dishNameKo ?? '').slice(0, 80),
  };
}

function parseBattleRoom(id: string, data: DocumentData): BattleRoomData {
  const statusStr = String(data.status ?? 'waiting');
  const status: RealtimeRoomStatus =
    statusStr === 'prep' ||
    statusStr === 'playing' ||
    statusStr === 'finished' ||
    statusStr === 'cancelled'
      ? statusStr
      : 'waiting';

  return {
    roomId: String(data.roomId ?? id),
    status,
    isMatchmaking: Boolean(data.isMatchmaking),
    judgeId: String(data.judgeId ?? 'judge_taupola'),
    hostUid: String(data.hostUid ?? ''),
    guestUid: String(data.guestUid ?? ''),
    host: sanitizeSlot(data.host as Record<string, unknown> | undefined),
    guest: sanitizeSlot(data.guest as Record<string, unknown> | undefined),
    winnerUid: String(data.winnerUid ?? ''),
    createdAtMs: toMs(data.createdAt),
    startedAtMs: toMs(data.startedAt),
    updatedAtMs: toMs(data.updatedAt),
  };
}

function serializeSlot(slot: BattlePlayerSlot): Record<string, unknown> {
  return {
    uid: slot.uid,
    displayName: slot.uid ? sanitizeDisplayName(slot.displayName) : '',
    chefTitle: slot.uid ? slot.chefTitle.slice(0, 40) : '',
    wins: clampInt(slot.wins, 0, 100000),
    losses: clampInt(slot.losses, 0, 100000),
    bestDishScore: clampInt(slot.bestDishScore, 0, 1000),
    rarestFishTier: sanitizeTier(slot.rarestFishTier),
    ready: Boolean(slot.ready),
    fishSpeciesId: slot.fishSpeciesId.slice(0, 60),
    fishWeightKg: Math.max(0, Math.min(500, Math.round(slot.fishWeightKg * 10) / 10)),
    ingredientIds: slot.ingredientIds
      .map((x) => x.trim().slice(0, 60))
      .filter((x) => x.length > 0)
      .slice(0, 3),
    stage: slot.stage,
    washScore: clampInt(slot.washScore, 0, 100),
    prepScore: clampInt(slot.prepScore, 0, 100),
    cookScore: clampInt(slot.cookScore, 0, 100),
    perfectionScore: clampInt(slot.perfectionScore, 0, 100),
    palateScore: clampInt(slot.palateScore, 0, 100),
    totalScore: clampInt(slot.totalScore, 0, 200),
    dishNameKo: slot.dishNameKo.slice(0, 80),
  };
}

export async function createBattleRoom(
  profile: UserProfileData,
  isMatchmaking: boolean,
  judgeId: string,
): Promise<BattleRoomData> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new BattleRoomError('Google 로그인 세션이 확인되지 않습니다. 먼저 Google 로그인을 해주세요.');
  }
  const uid = currentUser.uid;
  const hostSlot = buildPlayerSlotFromProfile({
    ...profile,
    uid,
    displayName: profile.displayName || currentUser.displayName || '투발루 셰프',
  });
  const emptyGuest = buildEmptyBattleSlot();
  const safeJudgeId = judgeId.trim().slice(0, 40) || 'judge_taupola';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomCode();
    const path = `battleRooms/${roomId}`;
    try {
      const created = await runTransaction(db, async (tx) => {
        const roomRef = doc(db, 'battleRooms', roomId);
        const snap = await tx.get(roomRef);
        if (snap.exists()) {
          return null;
        }
        tx.set(roomRef, {
          roomId,
          status: 'waiting',
          isMatchmaking,
          judgeId: safeJudgeId,
          hostUid: uid,
          guestUid: '',
          host: serializeSlot(hostSlot),
          guest: serializeSlot(emptyGuest),
          winnerUid: '',
          createdAt: serverTimestamp(),
          startedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          roomId,
          status: 'waiting' as const,
          isMatchmaking,
          judgeId: safeJudgeId,
          hostUid: uid,
          guestUid: '',
          host: hostSlot,
          guest: emptyGuest,
          winnerUid: '',
          createdAtMs: Date.now(),
          startedAtMs: Date.now(),
          updatedAtMs: Date.now(),
        };
      });
      if (created) return created;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  throw new BattleRoomError('방 코드 생성에 실패했습니다. 다시 시도해 주세요.');
}

export async function joinBattleRoomByCode(
  rawRoomCode: string,
  profile: UserProfileData,
): Promise<BattleRoomData> {
  const roomId = normalizeRoomCode(rawRoomCode);
  if (roomId.length !== 6) {
    throw new BattleRoomError('방 코드는 영문/숫자 6자리여야 합니다.');
  }

  const uid = auth.currentUser?.uid || profile.uid;
  const guestSlot = buildPlayerSlotFromProfile({ ...profile, uid });
  const path = `battleRooms/${roomId}`;

  try {
    return await runTransaction(db, async (tx) => {
      const roomRef = doc(db, 'battleRooms', roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists()) {
        throw new BattleRoomError('존재하지 않는 방 코드입니다. 코드를 다시 확인해 주세요.');
      }
      const room = parseBattleRoom(roomId, snap.data());
      if (room.hostUid === uid) {
        throw new BattleRoomError('내가 만든 방에는 참가자로 들어갈 수 없습니다.');
      }
      if (room.status !== 'waiting' || room.guestUid !== '') {
        throw new BattleRoomError('이미 다른 참가자가 입장했거나 종료된 방입니다.');
      }

      tx.update(roomRef, {
        guestUid: uid,
        guest: serializeSlot(guestSlot),
        status: 'prep',
        updatedAt: serverTimestamp(),
      });

      return {
        ...room,
        guestUid: uid,
        guest: guestSlot,
        status: 'prep',
        updatedAtMs: Date.now(),
      };
    });
  } catch (error) {
    if (error instanceof BattleRoomError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function findOrCreateMatchmakingRoom(
  profile: UserProfileData,
  judgeId: string,
): Promise<{ room: BattleRoomData; role: 'host' | 'guest' }> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new BattleRoomError('Google 로그인 세션이 확인되지 않습니다. 먼저 Google 로그인을 해주세요.');
  }
  const uid = currentUser.uid;
  const path = 'battleRooms';

  try {
    const q = query(
      collection(db, 'battleRooms'),
      where('status', '==', 'waiting'),
      where('isMatchmaking', '==', true),
      limit(12),
    );
    const snap = await getDocs(q);
    const cutoffMs = Date.now() - 15 * 60 * 1000;

    const candidates = snap.docs
      .map((d) => parseBattleRoom(d.id, d.data()))
      .filter((r) => r.guestUid === '' && r.hostUid !== uid && r.createdAtMs >= cutoffMs);

    for (const candidate of candidates) {
      try {
        const joined = await joinBattleRoomByCode(candidate.roomId, profile);
        return { room: joined, role: 'guest' };
      } catch (err) {
        if (err instanceof BattleRoomError) {
          // Race: another player joined first; try next candidate
          continue;
        }
        throw err;
      }
    }

    const created = await createBattleRoom(profile, true, judgeId);
    return { room: created, role: 'host' };
  } catch (error) {
    if (error instanceof BattleRoomError) throw error;
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('requires an index') || msg.includes('failed-precondition')) {
      const created = await createBattleRoom(profile, true, judgeId);
      return { room: created, role: 'host' };
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeBattleRoom(
  roomId: string,
  onData: (room: BattleRoomData | null) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `battleRooms/${roomId}`;
  return onSnapshot(
    doc(db, 'battleRooms', roomId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(parseBattleRoom(snap.id, snap.data()));
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export async function updateRealtimePrepChoice(
  roomId: string,
  role: 'host' | 'guest',
  payload: {
    fishSpeciesId: string;
    fishWeightKg: number;
    ingredientIds: string[];
    ready: boolean;
  },
): Promise<BattleRoomData> {
  const path = `battleRooms/${roomId}`;
  const uid = auth.currentUser?.uid;
  try {
    return await runTransaction(db, async (tx) => {
      const roomRef = doc(db, 'battleRooms', roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists()) {
        throw new BattleRoomError('대결 방이 존재하지 않습니다.');
      }
      const room = parseBattleRoom(roomId, snap.data());
      if (room.status !== 'waiting' && room.status !== 'prep') {
        return room;
      }
      if (role === 'host' && uid && room.hostUid !== uid) {
        throw new BattleRoomError('방장 권한이 없습니다.');
      }
      if (role === 'guest' && uid && room.guestUid !== uid) {
        throw new BattleRoomError('참가자 권한이 없습니다.');
      }

      const selfSlot = role === 'host' ? room.host : room.guest;
      const otherSlot = role === 'host' ? room.guest : room.host;

      const nextSelf: BattlePlayerSlot = {
        ...selfSlot,
        fishSpeciesId: payload.fishSpeciesId.slice(0, 60),
        fishWeightKg: Math.max(0, Math.min(500, Math.round(payload.fishWeightKg * 10) / 10)),
        ingredientIds: payload.ingredientIds.slice(0, 3),
        ready: payload.ready,
        stage: 'idle',
      };

      const bothReady = room.status === 'prep' && nextSelf.ready && otherSlot.ready;
      const updates: Record<string, unknown> = {
        [role]: serializeSlot(
          bothReady ? { ...nextSelf, stage: 'intro' } : nextSelf,
        ),
        updatedAt: serverTimestamp(),
      };

      if (bothReady) {
        updates.status = 'playing';
        updates.startedAt = serverTimestamp();
      }

      tx.update(roomRef, updates);

      return {
        ...room,
        status: bothReady ? 'playing' : room.status,
        [role]: bothReady ? { ...nextSelf, stage: 'intro' } : nextSelf,
        updatedAtMs: Date.now(),
      };
    });
  } catch (error) {
    if (error instanceof BattleRoomError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateRealtimeBattleStage(
  roomId: string,
  role: 'host' | 'guest',
  payload: {
    stage: RealtimePlayerStage;
    washScore?: number;
    prepScore?: number;
    cookScore?: number;
  },
): Promise<void> {
  const path = `battleRooms/${roomId}`;
  try {
    await runTransaction(db, async (tx) => {
      const roomRef = doc(db, 'battleRooms', roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const room = parseBattleRoom(roomId, snap.data());
      if (room.status !== 'playing') return;

      const selfSlot = role === 'host' ? room.host : room.guest;
      const nextSelf: BattlePlayerSlot = {
        ...selfSlot,
        stage: payload.stage,
        washScore: payload.washScore !== undefined ? clampInt(payload.washScore, 0, 100) : selfSlot.washScore,
        prepScore: payload.prepScore !== undefined ? clampInt(payload.prepScore, 0, 100) : selfSlot.prepScore,
        cookScore: payload.cookScore !== undefined ? clampInt(payload.cookScore, 0, 100) : selfSlot.cookScore,
      };

      tx.update(roomRef, {
        [role]: serializeSlot(nextSelf),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitRealtimeBattleFinish(
  roomId: string,
  role: 'host' | 'guest',
  payload: {
    washScore: number;
    prepScore: number;
    cookScore: number;
    perfectionScore: number;
    palateScore: number;
    totalScore: number;
    dishNameKo: string;
  },
): Promise<BattleRoomData> {
  const path = `battleRooms/${roomId}`;
  try {
    return await runTransaction(db, async (tx) => {
      const roomRef = doc(db, 'battleRooms', roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists()) {
        throw new BattleRoomError('대결 방 정보를 찾을 수 없습니다.');
      }
      const room = parseBattleRoom(roomId, snap.data());
      if (room.status === 'finished' || room.status === 'cancelled') {
        return room;
      }

      const selfSlot = role === 'host' ? room.host : room.guest;
      const otherSlot = role === 'host' ? room.guest : room.host;

      const washScore = clampInt(payload.washScore, 0, 100);
      const prepScore = clampInt(payload.prepScore, 0, 100);
      const cookScore = clampInt(payload.cookScore, 0, 100);
      const perfectionScore = clampInt(payload.perfectionScore, 0, 100);
      const palateScore = clampInt(payload.palateScore, 0, 100);
      const totalScore = clampInt(perfectionScore + palateScore, 0, 200);

      const nextSelf: BattlePlayerSlot = {
        ...selfSlot,
        stage: 'done',
        washScore,
        prepScore,
        cookScore,
        perfectionScore,
        palateScore,
        totalScore,
        dishNameKo: payload.dishNameKo.slice(0, 80),
      };

      const updates: Record<string, unknown> = {
        [role]: serializeSlot(nextSelf),
        updatedAt: serverTimestamp(),
      };

      let nextStatus: RealtimeRoomStatus = room.status;
      let nextWinnerUid = room.winnerUid;

      if (otherSlot.stage === 'done') {
        nextStatus = 'finished';
        const hostScore = role === 'host' ? totalScore : otherSlot.totalScore;
        const guestScore = role === 'guest' ? totalScore : otherSlot.totalScore;
        if (hostScore > guestScore) nextWinnerUid = room.hostUid;
        else if (guestScore > hostScore) nextWinnerUid = room.guestUid;
        else nextWinnerUid = 'draw';

        updates.status = 'finished';
        updates.winnerUid = nextWinnerUid;
      }

      tx.update(roomRef, updates);

      return {
        ...room,
        status: nextStatus,
        winnerUid: nextWinnerUid,
        [role]: nextSelf,
        updatedAtMs: Date.now(),
      };
    });
  } catch (error) {
    if (error instanceof BattleRoomError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function finalizeTimedOutRealtimeBattle(
  roomId: string,
  role: 'host' | 'guest',
): Promise<BattleRoomData> {
  const path = `battleRooms/${roomId}`;
  try {
    return await runTransaction(db, async (tx) => {
      const roomRef = doc(db, 'battleRooms', roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists()) {
        throw new BattleRoomError('대결 방 정보를 찾을 수 없습니다.');
      }
      const room = parseBattleRoom(roomId, snap.data());
      if (room.status === 'finished' || room.status === 'cancelled') {
        return room;
      }

      const selfUid = role === 'host' ? room.hostUid : room.guestUid;
      const otherSlot = role === 'host' ? room.guest : room.host;
      const selfSlot = role === 'host' ? room.host : room.guest;

      let winnerUid = selfUid;
      if (otherSlot.stage === 'done') {
        const hostScore = room.host.totalScore;
        const guestScore = room.guest.totalScore;
        winnerUid = hostScore > guestScore ? room.hostUid : guestScore > hostScore ? room.guestUid : 'draw';
      }

      tx.update(roomRef, {
        [role]: serializeSlot(selfSlot),
        status: 'finished',
        winnerUid,
        updatedAt: serverTimestamp(),
      });

      return {
        ...room,
        status: 'finished',
        winnerUid,
        updatedAtMs: Date.now(),
      };
    });
  } catch (error) {
    if (error instanceof BattleRoomError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelOrLeaveBattleRoom(
  roomId: string,
  role: 'host' | 'guest',
): Promise<void> {
  const path = `battleRooms/${roomId}`;
  try {
    await runTransaction(db, async (tx) => {
      const roomRef = doc(db, 'battleRooms', roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const room = parseBattleRoom(roomId, snap.data());
      if (room.status === 'finished' || room.status === 'cancelled') return;

      const selfSlot = role === 'host' ? room.host : room.guest;
      tx.update(roomRef, {
        [role]: serializeSlot(selfSlot),
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
