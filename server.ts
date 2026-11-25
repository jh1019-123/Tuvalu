import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { Request, Response } from 'express';
import type {
  BattlePlayerSlot,
  BattleRoomData,
  FishTier,
  RealtimePlayerStage,
  RealtimeRoomStatus,
  UserProfileData,
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_ACTIVE_TTL_MS = 30 * 60 * 1000;
const ROOM_FINISHED_TTL_MS = 10 * 60 * 1000;
const MATCHMAKING_MAX_AGE_MS = 15 * 60 * 1000;
const TIMEOUT_GRACE_MS = 25 * 1000;

const VALID_TIERS = new Set<string>([
  'none',
  'common',
  'uncommon',
  'epic',
  'legendary',
  'mythic',
]);

const VALID_STAGES = new Set<string>(['idle', 'intro', 'wash', 'prep', 'cook', 'done']);

const rooms = new Map<string, BattleRoomData>();
const roomSubscribers = new Map<string, Set<WebSocket>>();

function clampInt(val: unknown, min: number, max: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  const rounded = Math.round(Number.isFinite(num) ? num : min);
  return Math.max(min, Math.min(max, rounded));
}

function sanitizeDisplayName(name: unknown): string {
  const str = typeof name === 'string' ? name.trim().slice(0, 32) : '';
  return str.length > 0 ? str : '푸나푸티 셰프';
}

function sanitizeUid(uid: unknown): string {
  if (typeof uid !== 'string') return '';
  const cleaned = uid.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return cleaned.length >= 3 ? cleaned : '';
}

function sanitizeTier(tier: unknown): FishTier | 'none' {
  const s = typeof tier === 'string' ? tier : 'none';
  return VALID_TIERS.has(s) ? (s as FishTier | 'none') : 'none';
}

function sanitizeStage(stage: unknown): RealtimePlayerStage {
  const s = typeof stage === 'string' ? stage : 'idle';
  return VALID_STAGES.has(s) ? (s as RealtimePlayerStage) : 'idle';
}

function normalizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function generateUniqueRoomCode(): string | null {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return null;
}

function getChefTitleForWins(wins: number): string {
  if (wins >= 25) return '전설의 아톨 마스터 셰프';
  if (wins >= 15) return '투발루 로얄 셰프';
  if (wins >= 8) return '라군 수석 셰프';
  if (wins >= 3) return '바다의 숙련 요리사';
  return '푸나푸티 셰프';
}

function buildEmptySlot(): BattlePlayerSlot {
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

function buildPlayerSlot(rawProfile: unknown, fallbackUid: string): BattlePlayerSlot {
  const p = (rawProfile && typeof rawProfile === 'object' ? rawProfile : {}) as Partial<UserProfileData>;
  const wins = clampInt(p.wins ?? 0, 0, 100000);
  const losses = clampInt(p.losses ?? 0, 0, 100000);
  return {
    uid: fallbackUid,
    displayName: sanitizeDisplayName(p.displayName),
    chefTitle: getChefTitleForWins(wins).slice(0, 40),
    wins,
    losses,
    bestDishScore: clampInt(p.bestDishScore ?? 0, 0, 1000),
    rarestFishTier: sanitizeTier(p.rarestFishTier),
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

function createRoomRecord(
  profile: unknown,
  uid: string,
  isMatchmaking: boolean,
  judgeId: unknown,
): BattleRoomData | null {
  const roomId = generateUniqueRoomCode();
  if (!roomId) return null;
  const now = Date.now();
  const safeJudgeId =
    typeof judgeId === 'string' && judgeId.trim().length > 0
      ? judgeId.trim().slice(0, 40)
      : 'judge_taupola';

  const room: BattleRoomData = {
    roomId,
    status: 'waiting',
    isMatchmaking: Boolean(isMatchmaking),
    judgeId: safeJudgeId,
    hostUid: uid,
    guestUid: '',
    host: buildPlayerSlot(profile, uid),
    guest: buildEmptySlot(),
    winnerUid: '',
    createdAtMs: now,
    startedAtMs: now,
    updatedAtMs: now,
  };

  rooms.set(roomId, room);
  return room;
}

function broadcastRoom(room: BattleRoomData): void {
  const subs = roomSubscribers.get(room.roomId);
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify({ type: 'room:update', room });
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function cleanupStaleRooms(): void {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    const ttl =
      room.status === 'finished' || room.status === 'cancelled'
        ? ROOM_FINISHED_TTL_MS
        : ROOM_ACTIVE_TTL_MS;
    if (now - room.updatedAtMs > ttl) {
      rooms.delete(roomId);
      const subs = roomSubscribers.get(roomId);
      if (subs) {
        const payload = JSON.stringify({ type: 'room:missing', roomId });
        for (const ws of subs) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        }
        roomSubscribers.delete(roomId);
      }
    }
  }
}

const cleanupTimer = setInterval(cleanupStaleRooms, 60_000);
cleanupTimer.unref();

function verifyParticipant(
  room: BattleRoomData,
  role: unknown,
  uid: unknown,
): { ok: true; role: 'host' | 'guest'; uid: string } | { ok: false; status: number; error: string } {
  if (role !== 'host' && role !== 'guest') {
    return { ok: false, status: 400, error: '올바르지 않은 참가자 역할입니다.' };
  }
  const cleanUid = sanitizeUid(uid);
  if (!cleanUid) {
    return { ok: false, status: 400, error: '플레이어 식별 정보가 유효하지 않습니다.' };
  }
  if (role === 'host' && room.hostUid !== cleanUid) {
    return { ok: false, status: 403, error: '방장 권한이 없습니다.' };
  }
  if (role === 'guest' && room.guestUid !== cleanUid) {
    return { ok: false, status: 403, error: '참가자 권한이 없습니다.' };
  }
  return { ok: true, role, uid: cleanUid };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  // Create a room (no login required)
  app.post('/api/battle/rooms', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      profile?: UserProfileData;
      isMatchmaking?: boolean;
      judgeId?: string;
    };
    const uid = sanitizeUid(body.profile?.uid);
    if (!uid) {
      res.status(400).json({ error: '플레이어 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.' });
      return;
    }

    const room = createRoomRecord(body.profile, uid, Boolean(body.isMatchmaking), body.judgeId);
    if (!room) {
      res.status(503).json({ error: '방 코드 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }

    broadcastRoom(room);
    res.status(201).json({ room });
  });

  // Join an existing room by 6-char room code
  app.post('/api/battle/rooms/:roomId/join', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    if (roomId.length !== 6) {
      res.status(400).json({ error: '방 코드는 영문/숫자 6자리여야 합니다.' });
      return;
    }

    const body = (req.body ?? {}) as { profile?: UserProfileData };
    const uid = sanitizeUid(body.profile?.uid);
    if (!uid) {
      res.status(400).json({ error: '플레이어 정보가 올바르지 않습니다.' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: '존재하지 않는 방 코드입니다. 코드를 다시 확인해 주세요.' });
      return;
    }
    if (room.hostUid === uid) {
      res.status(400).json({ error: '내가 만든 방에는 참가자로 들어갈 수 없습니다.' });
      return;
    }
    if (room.status !== 'waiting' || room.guestUid !== '') {
      res.status(409).json({ error: '이미 다른 참가자가 입장했거나 종료된 방입니다.' });
      return;
    }

    const now = Date.now();
    const updated: BattleRoomData = {
      ...room,
      guestUid: uid,
      guest: buildPlayerSlot(body.profile, uid),
      status: 'prep',
      updatedAtMs: now,
    };
    rooms.set(roomId, updated);
    broadcastRoom(updated);
    res.json({ room: updated });
  });

  // Random matchmaking: join oldest/newest open matchmaking room or create one
  app.post('/api/battle/matchmaking', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      profile?: UserProfileData;
      judgeId?: string;
    };
    const uid = sanitizeUid(body.profile?.uid);
    if (!uid) {
      res.status(400).json({ error: '플레이어 정보가 올바르지 않습니다.' });
      return;
    }

    const cutoff = Date.now() - MATCHMAKING_MAX_AGE_MS;
    const candidates = Array.from(rooms.values())
      .filter(
        (r) =>
          r.status === 'waiting' &&
          r.isMatchmaking &&
          r.guestUid === '' &&
          r.hostUid !== uid &&
          r.createdAtMs >= cutoff,
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    if (candidates.length > 0) {
      const target = candidates[0];
      const now = Date.now();
      const joined: BattleRoomData = {
        ...target,
        guestUid: uid,
        guest: buildPlayerSlot(body.profile, uid),
        status: 'prep',
        updatedAtMs: now,
      };
      rooms.set(target.roomId, joined);
      broadcastRoom(joined);
      res.json({ room: joined, role: 'guest' });
      return;
    }

    const created = createRoomRecord(body.profile, uid, true, body.judgeId);
    if (!created) {
      res.status(503).json({ error: '매칭 방 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }

    broadcastRoom(created);
    res.status(201).json({ room: created, role: 'host' });
  });

  // Fetch room snapshot (polling / reconnect fallback)
  app.get('/api/battle/rooms/:roomId', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: '방 정보를 찾을 수 없습니다.' });
      return;
    }
    res.json({ room });
  });

  // Update dish choice & ready status in prep phase
  app.post('/api/battle/rooms/:roomId/prep', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: '대결 방이 존재하지 않습니다.' });
      return;
    }

    const body = (req.body ?? {}) as {
      role?: 'host' | 'guest';
      uid?: string;
      fishSpeciesId?: string;
      fishWeightKg?: number;
      ingredientIds?: string[];
      ready?: boolean;
    };

    const authCheck = verifyParticipant(room, body.role, body.uid);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    if (room.status !== 'waiting' && room.status !== 'prep') {
      res.json({ room });
      return;
    }

    const { role } = authCheck;
    const selfSlot = role === 'host' ? room.host : room.guest;
    const otherSlot = role === 'host' ? room.guest : room.host;

    const cleanIngredients = Array.isArray(body.ingredientIds)
      ? body.ingredientIds
          .map((x) => (typeof x === 'string' ? x.trim().slice(0, 60) : ''))
          .filter((x) => x.length > 0)
          .slice(0, 3)
      : [];

    const weightRaw = Number(body.fishWeightKg ?? 0);
    const fishWeightKg = Number.isFinite(weightRaw)
      ? Math.max(0, Math.min(500, Math.round(weightRaw * 10) / 10))
      : 0;

    const nextSelf: BattlePlayerSlot = {
      ...selfSlot,
      fishSpeciesId: typeof body.fishSpeciesId === 'string' ? body.fishSpeciesId.slice(0, 60) : '',
      fishWeightKg,
      ingredientIds: cleanIngredients,
      ready: Boolean(body.ready),
      stage: 'idle',
    };

    const bothReady = room.status === 'prep' && nextSelf.ready && otherSlot.ready;
    const now = Date.now();

    const updated: BattleRoomData = {
      ...room,
      status: bothReady ? 'playing' : room.status,
      startedAtMs: bothReady ? now : room.startedAtMs,
      updatedAtMs: now,
      host:
        role === 'host'
          ? bothReady
            ? { ...nextSelf, stage: 'intro' }
            : nextSelf
          : bothReady
            ? { ...room.host, stage: 'intro' }
            : room.host,
      guest:
        role === 'guest'
          ? bothReady
            ? { ...nextSelf, stage: 'intro' }
            : nextSelf
          : bothReady
            ? { ...room.guest, stage: 'intro' }
            : room.guest,
    };

    rooms.set(roomId, updated);
    broadcastRoom(updated);
    res.json({ room: updated });
  });

  // Update active cooking stage & progress scores
  app.post('/api/battle/rooms/:roomId/stage', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: '대결 방 정보를 찾을 수 없습니다.' });
      return;
    }

    const body = (req.body ?? {}) as {
      role?: 'host' | 'guest';
      uid?: string;
      stage?: RealtimePlayerStage;
      washScore?: number;
      prepScore?: number;
      cookScore?: number;
    };

    const authCheck = verifyParticipant(room, body.role, body.uid);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    if (room.status !== 'playing') {
      res.json({ room });
      return;
    }

    const { role } = authCheck;
    const selfSlot = role === 'host' ? room.host : room.guest;
    const nextSelf: BattlePlayerSlot = {
      ...selfSlot,
      stage: sanitizeStage(body.stage),
      washScore: body.washScore !== undefined ? clampInt(body.washScore, 0, 100) : selfSlot.washScore,
      prepScore: body.prepScore !== undefined ? clampInt(body.prepScore, 0, 100) : selfSlot.prepScore,
      cookScore: body.cookScore !== undefined ? clampInt(body.cookScore, 0, 100) : selfSlot.cookScore,
    };

    const updated: BattleRoomData = {
      ...room,
      [role]: nextSelf,
      updatedAtMs: Date.now(),
    };

    rooms.set(roomId, updated);
    broadcastRoom(updated);
    res.json({ room: updated });
  });

  // Submit final dish score when a player finishes all 3 cooking stages
  app.post('/api/battle/rooms/:roomId/finish', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: '대결 방 정보를 찾을 수 없습니다.' });
      return;
    }

    const body = (req.body ?? {}) as {
      role?: 'host' | 'guest';
      uid?: string;
      washScore?: number;
      prepScore?: number;
      cookScore?: number;
      perfectionScore?: number;
      palateScore?: number;
      totalScore?: number;
      dishNameKo?: string;
    };

    const authCheck = verifyParticipant(room, body.role, body.uid);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    if (room.status === 'finished' || room.status === 'cancelled') {
      res.json({ room });
      return;
    }

    const { role } = authCheck;
    const selfSlot = role === 'host' ? room.host : room.guest;
    const otherSlot = role === 'host' ? room.guest : room.host;

    const perfectionScore = clampInt(body.perfectionScore ?? 0, 0, 100);
    const palateScore = clampInt(body.palateScore ?? 0, 0, 100);
    const totalScore = clampInt(perfectionScore + palateScore, 0, 200);

    const nextSelf: BattlePlayerSlot = {
      ...selfSlot,
      stage: 'done',
      washScore: clampInt(body.washScore ?? selfSlot.washScore, 0, 100),
      prepScore: clampInt(body.prepScore ?? selfSlot.prepScore, 0, 100),
      cookScore: clampInt(body.cookScore ?? selfSlot.cookScore, 0, 100),
      perfectionScore,
      palateScore,
      totalScore,
      dishNameKo: typeof body.dishNameKo === 'string' ? body.dishNameKo.slice(0, 80) : selfSlot.dishNameKo,
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
    }

    const updated: BattleRoomData = {
      ...room,
      status: nextStatus,
      winnerUid: nextWinnerUid,
      [role]: nextSelf,
      updatedAtMs: Date.now(),
    };

    rooms.set(roomId, updated);
    broadcastRoom(updated);
    res.json({ room: updated });
  });

  // Finalize battle if opponent stalls beyond 25s grace period
  app.post('/api/battle/rooms/:roomId/timeout', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: '대결 방 정보를 찾을 수 없습니다.' });
      return;
    }

    const body = (req.body ?? {}) as { role?: 'host' | 'guest'; uid?: string };
    const authCheck = verifyParticipant(room, body.role, body.uid);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    if (room.status === 'finished' || room.status === 'cancelled') {
      res.json({ room });
      return;
    }

    const { role, uid } = authCheck;
    const otherSlot = role === 'host' ? room.guest : room.host;

    if (otherSlot.stage !== 'done' && Date.now() - room.updatedAtMs < TIMEOUT_GRACE_MS) {
      res.status(409).json({ error: '상대방의 조리 완료를 기다리는 중입니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }

    let winnerUid = uid;
    if (otherSlot.stage === 'done') {
      const hostScore = room.host.totalScore;
      const guestScore = room.guest.totalScore;
      winnerUid =
        hostScore > guestScore ? room.hostUid : guestScore > hostScore ? room.guestUid : 'draw';
    }

    const updated: BattleRoomData = {
      ...room,
      status: 'finished',
      winnerUid,
      updatedAtMs: Date.now(),
    };

    rooms.set(roomId, updated);
    broadcastRoom(updated);
    res.json({ room: updated });
  });

  // Leave / cancel a room
  app.post('/api/battle/rooms/:roomId/leave', (req: Request, res: Response) => {
    const roomId = normalizeRoomCode(req.params.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      res.json({ ok: true });
      return;
    }

    const body = (req.body ?? {}) as { role?: 'host' | 'guest'; uid?: string };
    const authCheck = verifyParticipant(room, body.role, body.uid);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    if (room.status === 'finished' || room.status === 'cancelled') {
      res.json({ ok: true });
      return;
    }

    const updated: BattleRoomData = {
      ...room,
      status: 'cancelled',
      updatedAtMs: Date.now(),
    };
    rooms.set(roomId, updated);
    broadcastRoom(updated);
    res.json({ ok: true });
  });

  // Frontend Vite middleware (dev) or static dist serving (production)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const urlStr = request.url ?? '/';
    const parsedUrl = new URL(urlStr, `http://${request.headers.host || 'localhost'}`);
    if (parsedUrl.pathname !== '/ws/battle') {
      socket.destroy();
      return;
    }

    const roomId = normalizeRoomCode(parsedUrl.searchParams.get('roomId'));
    if (roomId.length !== 6) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      let subs = roomSubscribers.get(roomId);
      if (!subs) {
        subs = new Set<WebSocket>();
        roomSubscribers.set(roomId, subs);
      }
      subs.add(ws);

      const currentRoom = rooms.get(roomId);
      if (currentRoom) {
        ws.send(JSON.stringify({ type: 'room:update', room: currentRoom }));
      } else {
        ws.send(JSON.stringify({ type: 'room:missing', roomId }));
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { type?: string };
          if (msg.type === 'ping' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        const set = roomSubscribers.get(roomId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            roomSubscribers.delete(roomId);
          }
        }
      });
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Tuvalu Server] Listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

void startServer();
