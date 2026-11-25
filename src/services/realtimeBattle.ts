import { BattleRoomData, RealtimePlayerStage, UserProfileData } from '../types/game';

export class BattleRoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleRoomError';
  }
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
  } catch {
    throw new BattleRoomError('서버 연결이 원활하지 않습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `요청 처리 중 오류가 발생했습니다. (${res.status})`;
    throw new BattleRoomError(errMsg);
  }

  return data as T;
}

export async function createBattleRoom(
  profile: UserProfileData,
  isMatchmaking: boolean,
  judgeId: string,
): Promise<BattleRoomData> {
  const res = await apiJson<{ room: BattleRoomData }>('/api/battle/rooms', {
    method: 'POST',
    body: JSON.stringify({ profile, isMatchmaking, judgeId }),
  });
  return res.room;
}

export async function joinBattleRoomByCode(
  rawRoomCode: string,
  profile: UserProfileData,
): Promise<BattleRoomData> {
  const roomId = normalizeRoomCode(rawRoomCode);
  if (roomId.length !== 6) {
    throw new BattleRoomError('방 코드는 영문/숫자 6자리여야 합니다.');
  }
  const res = await apiJson<{ room: BattleRoomData }>(`/api/battle/rooms/${encodeURIComponent(roomId)}/join`, {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
  return res.room;
}

export async function findOrCreateMatchmakingRoom(
  profile: UserProfileData,
  judgeId: string,
): Promise<{ room: BattleRoomData; role: 'host' | 'guest' }> {
  return apiJson<{ room: BattleRoomData; role: 'host' | 'guest' }>('/api/battle/matchmaking', {
    method: 'POST',
    body: JSON.stringify({ profile, judgeId }),
  });
}

function getRoomSignature(room: BattleRoomData): string {
  return [
    room.status,
    room.updatedAtMs,
    room.host.ready,
    room.host.stage,
    room.host.totalScore,
    room.guestUid,
    room.guest.ready,
    room.guest.stage,
    room.guest.totalScore,
    room.winnerUid,
  ].join('|');
}

export function subscribeBattleRoom(
  rawRoomId: string,
  onData: (room: BattleRoomData | null) => void,
  onError?: (err: Error) => void,
): () => void {
  const roomId = normalizeRoomCode(rawRoomId);
  let closed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let lastSignature = '';

  const emitRoom = (room: BattleRoomData | null) => {
    if (closed) return;
    if (!room) {
      if (lastSignature !== 'MISSING') {
        lastSignature = 'MISSING';
        onData(null);
      }
      return;
    }
    const sig = getRoomSignature(room);
    if (sig !== lastSignature) {
      lastSignature = sig;
      onData(room);
    }
  };

  const fetchSnapshot = async () => {
    if (closed) return;
    try {
      const res = await fetch(`/api/battle/rooms/${encodeURIComponent(roomId)}`);
      if (closed) return;
      if (res.status === 404) {
        emitRoom(null);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { room?: BattleRoomData };
      if (data.room) {
        emitRoom(data.room);
      }
    } catch (err) {
      if (!closed && onError && err instanceof Error) {
        onError(err);
      }
    }
  };

  const connectWs = () => {
    if (closed || typeof window === 'undefined') return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws/battle?roomId=${encodeURIComponent(roomId)}`;

    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }

    ws.onopen = () => {
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type?: string;
          room?: BattleRoomData;
        };
        if (msg.type === 'room:update' && msg.room) {
          emitRoom(msg.room);
        } else if (msg.type === 'room:missing') {
          emitRoom(null);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (!closed) {
        reconnectTimer = window.setTimeout(connectWs, 1500);
      }
    };
  };

  void fetchSnapshot();
  connectWs();
  const pollTimer = window.setInterval(() => {
    void fetchSnapshot();
  }, 2500);

  return () => {
    closed = true;
    clearInterval(pollTimer);
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  };
}

export async function updateRealtimePrepChoice(
  roomId: string,
  role: 'host' | 'guest',
  uid: string,
  payload: {
    fishSpeciesId: string;
    fishWeightKg: number;
    ingredientIds: string[];
    ready: boolean;
  },
): Promise<BattleRoomData> {
  const res = await apiJson<{ room: BattleRoomData }>(
    `/api/battle/rooms/${encodeURIComponent(normalizeRoomCode(roomId))}/prep`,
    {
      method: 'POST',
      body: JSON.stringify({ role, uid, ...payload }),
    },
  );
  return res.room;
}

export async function updateRealtimeBattleStage(
  roomId: string,
  role: 'host' | 'guest',
  uid: string,
  payload: {
    stage: RealtimePlayerStage;
    washScore?: number;
    prepScore?: number;
    cookScore?: number;
  },
): Promise<void> {
  await apiJson<{ room: BattleRoomData }>(
    `/api/battle/rooms/${encodeURIComponent(normalizeRoomCode(roomId))}/stage`,
    {
      method: 'POST',
      body: JSON.stringify({ role, uid, ...payload }),
    },
  );
}

export async function submitRealtimeBattleFinish(
  roomId: string,
  role: 'host' | 'guest',
  uid: string,
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
  const res = await apiJson<{ room: BattleRoomData }>(
    `/api/battle/rooms/${encodeURIComponent(normalizeRoomCode(roomId))}/finish`,
    {
      method: 'POST',
      body: JSON.stringify({ role, uid, ...payload }),
    },
  );
  return res.room;
}

export async function finalizeTimedOutRealtimeBattle(
  roomId: string,
  role: 'host' | 'guest',
  uid: string,
): Promise<BattleRoomData> {
  const res = await apiJson<{ room: BattleRoomData }>(
    `/api/battle/rooms/${encodeURIComponent(normalizeRoomCode(roomId))}/timeout`,
    {
      method: 'POST',
      body: JSON.stringify({ role, uid }),
    },
  );
  return res.room;
}

export async function cancelOrLeaveBattleRoom(
  roomId: string,
  role: 'host' | 'guest',
  uid: string,
): Promise<void> {
  try {
    await apiJson<{ ok: boolean }>(
      `/api/battle/rooms/${encodeURIComponent(normalizeRoomCode(roomId))}/leave`,
      {
        method: 'POST',
        body: JSON.stringify({ role, uid }),
      },
    );
  } catch {
    // Best-effort cleanup when leaving
  }
}
