import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  DoorOpen,
  Flame,
  KeyRound,
  Loader2,
  LogIn,
  PlusCircle,
  Radio,
  ShoppingBag,
  Shuffle,
  Swords,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  FISH_CATALOG,
  FISH_TIERS,
  FLAVOR_LABELS,
  INGREDIENT_CATALOG,
  TUVALU_JUDGES,
  getChefTitleForWins,
} from '../data/tuvaluData';
import {
  BattleRoomError,
  cancelOrLeaveBattleRoom,
  createBattleRoom,
  findOrCreateMatchmakingRoom,
  joinBattleRoomByCode,
  normalizeRoomCode,
  subscribeBattleRoom,
  updateRealtimePrepChoice,
} from '../services/firebase';
import {
  BattlePlayerSlot,
  BattleRoomData,
  CaughtFish,
  UserProfileData,
} from '../types/game';

interface RealtimeBattleModalProps {
  isSignedIn: boolean;
  profile: UserProfileData;
  fishInventory: CaughtFish[];
  pantry: Record<string, number>;
  initialRoom: BattleRoomData | null;
  initialRole: 'host' | 'guest' | null;
  onSignIn: () => Promise<void>;
  onRoomBound: (room: BattleRoomData | null, role: 'host' | 'guest' | null) => void;
  onBattleLaunch: (
    room: BattleRoomData,
    role: 'host' | 'guest',
    fish: CaughtFish,
    ingredientIds: string[],
  ) => void;
  onOpenMarket: () => void;
  onGoFishing: () => void;
  onClose: () => void;
}

export const RealtimeBattleModal: React.FC<RealtimeBattleModalProps> = ({
  isSignedIn,
  profile,
  fishInventory,
  pantry,
  initialRoom,
  initialRole,
  onSignIn,
  onRoomBound,
  onBattleLaunch,
  onOpenMarket,
  onGoFishing,
  onClose,
}) => {
  const [lobbyTab, setLobbyTab] = useState<'join' | 'create'>('join');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [allowRandomJoin, setAllowRandomJoin] = useState(false);

  const [room, setRoom] = useState<BattleRoomData | null>(initialRoom);
  const [role, setRole] = useState<'host' | 'guest' | null>(initialRole);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dish Selection State inside Waiting / Prep Room
  const [selectedFishUid, setSelectedFishUid] = useState<string>(fishInventory[0]?.uid ?? '');
  const [selectedIngIds, setSelectedIngIds] = useState<string[]>(() => {
    const owned = INGREDIENT_CATALOG.filter((i) => (pantry[i.id] ?? 0) > 0).map((i) => i.id);
    return owned.slice(0, 3);
  });

  const selectedFish = fishInventory.find((f) => f.uid === selectedFishUid) ?? fishInventory[0];
  const selectedSpecies = selectedFish
    ? FISH_CATALOG.find((s) => s.id === selectedFish.speciesId)
    : undefined;

  const ownedIngredients = useMemo(
    () => INGREDIENT_CATALOG.filter((item) => (pantry[item.id] ?? 0) > 0),
    [pantry],
  );

  const launchedRef = useRef(false);
  const selectedFishRef = useRef(selectedFish);
  selectedFishRef.current = selectedFish;
  const selectedIngIdsRef = useRef(selectedIngIds);
  selectedIngIdsRef.current = selectedIngIds;
  const onBattleLaunchRef = useRef(onBattleLaunch);
  onBattleLaunchRef.current = onBattleLaunch;
  const onRoomBoundRef = useRef(onRoomBound);
  onRoomBoundRef.current = onRoomBound;

  // Live Firestore subscription when inside a room
  useEffect(() => {
    if (!room?.roomId || !role) return;
    launchedRef.current = false;

    const unsub = subscribeBattleRoom(
      room.roomId,
      (latest) => {
        if (!latest) {
          setRoom(null);
          setRole(null);
          onRoomBoundRef.current(null, null);
          setErrorMsg('방 정보가 종료되었거나 삭제되었습니다.');
          return;
        }
        setRoom(latest);
        onRoomBoundRef.current(latest, role);

        if (latest.status === 'cancelled') {
          setErrorMsg('상대방이 나가거나 방이 취소되었습니다.');
          setRoom(null);
          setRole(null);
          onRoomBoundRef.current(null, null);
          return;
        }

        if (latest.status === 'playing' && !launchedRef.current) {
          const fish = selectedFishRef.current;
          if (!fish) {
            setErrorMsg('선택된 물고기가 없어 대결을 시작할 수 없습니다.');
            return;
          }
          launchedRef.current = true;
          onBattleLaunchRef.current(latest, role, fish, selectedIngIdsRef.current);
        }
      },
      () => {
        setErrorMsg('실시간 방 연결 중 오류가 발생했습니다.');
      },
    );

    return () => unsub();
  }, [room?.roomId, role]);

  const activeJudge = useMemo(() => {
    const found = room ? TUVALU_JUDGES.find((j) => j.id === room.judgeId) : undefined;
    return found ?? TUVALU_JUDGES[0];
  }, [room]);

  const palatePreviewScore = useMemo(() => {
    if (!selectedSpecies) return 0;
    let score = 35;
    selectedSpecies.flavorTags.forEach((tag) => {
      if (activeJudge.preferredFlavors.includes(tag)) score += 12;
    });
    selectedIngIds.forEach((id) => {
      const ing = INGREDIENT_CATALOG.find((i) => i.id === id);
      if (!ing) return;
      score += Math.round(ing.palateBonus * 0.65);
      ing.flavorTags.forEach((t) => {
        if (activeJudge.preferredFlavors.includes(t)) score += 9;
      });
    });
    return Math.min(100, score);
  }, [selectedSpecies, selectedIngIds, activeJudge]);

  const toggleIngredient = (id: string) => {
    const mySlot = room && role ? (role === 'host' ? room.host : room.guest) : null;
    if (mySlot?.ready) return;
    setSelectedIngIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      await onSignIn();
    } catch {
      setErrorMsg('Google 로그인에 실패했거나 창이 닫혔습니다.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedFish) {
      setErrorMsg('먼저 낚시터에서 물고기를 1마리 이상 낚아오세요!');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const randomJudge = TUVALU_JUDGES[Math.floor(Math.random() * TUVALU_JUDGES.length)];
      const created = await createBattleRoom(profile, allowRandomJoin, randomJudge.id);
      setRoom(created);
      setRole('host');
      onRoomBound(created, 'host');
    } catch (err) {
      setErrorMsg(err instanceof BattleRoomError ? err.message : '방을 만드는 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!selectedFish) {
      setErrorMsg('먼저 낚시터에서 물고기를 1마리 이상 낚아오세요!');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const joined = await joinBattleRoomByCode(roomCodeInput, profile);
      setRoom(joined);
      setRole('guest');
      onRoomBound(joined, 'guest');
    } catch (err) {
      setErrorMsg(err instanceof BattleRoomError ? err.message : '방 참가 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleRandomMatch = async () => {
    if (!selectedFish) {
      setErrorMsg('먼저 낚시터에서 물고기를 1마리 이상 낚아오세요!');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const randomJudge = TUVALU_JUDGES[Math.floor(Math.random() * TUVALU_JUDGES.length)];
      const res = await findOrCreateMatchmakingRoom(profile, randomJudge.id);
      setRoom(res.room);
      setRole(res.role);
      onRoomBound(res.room, res.role);
    } catch (err) {
      setErrorMsg(err instanceof BattleRoomError ? err.message : '랜덤 매칭 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleReady = async () => {
    if (!room || !role || !selectedFish || !selectedSpecies) return;
    const mySlot = role === 'host' ? room.host : room.guest;
    const nextReady = !mySlot.ready;
    setBusy(true);
    setErrorMsg(null);
    try {
      const updated = await updateRealtimePrepChoice(room.roomId, role, {
        fishSpeciesId: selectedSpecies.id,
        fishWeightKg: selectedFish.weightKg,
        ingredientIds: selectedIngIds,
        ready: nextReady,
      });
      setRoom(updated);
    } catch (err) {
      setErrorMsg(err instanceof BattleRoomError ? err.message : '준비 상태 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (room && role) {
      try {
        await cancelOrLeaveBattleRoom(room.roomId, role);
      } catch {
        // ignore
      }
    }
    setRoom(null);
    setRole(null);
    onRoomBound(null, null);
    setErrorMsg(null);
  };

  const handleCloseModal = async () => {
    if (room && role && (room.status === 'waiting' || room.status === 'prep')) {
      await handleLeaveRoom();
    }
    onClose();
  };

  const copyRoomCode = () => {
    if (!room) return;
    void navigator.clipboard?.writeText(room.roomId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const mySlot: BattlePlayerSlot | null =
    room && role ? (role === 'host' ? room.host : room.guest) : null;
  const oppSlot: BattlePlayerSlot | null =
    room && role ? (role === 'host' ? room.guest : room.host) : null;

  const renderProfileCard = (
    slot: BattlePlayerSlot,
    label: string,
    isSelf: boolean,
    waitingForOpponent = false,
  ) => {
    if (waitingForOpponent) {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300/45 bg-slate-900/55 p-4 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
          <div className="mt-2 text-sm font-extrabold text-amber-200">참가자 1명 대기 중...</div>
          <p className="mt-1 text-[11px] text-slate-300">
            상대가 방 코드를 입력하거나 랜덤 매칭되면 대결 준비가 시작됩니다.
          </p>
        </div>
      );
    }

    const tierMeta =
      slot.rarestFishTier !== 'none' ? FISH_TIERS[slot.rarestFishTier] : null;

    return (
      <div
        className={`rounded-2xl border p-4 ${
          isSelf
            ? 'border-cyan-300/50 bg-[#0d394a]'
            : 'border-rose-400/45 bg-[#1b2438]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
              isSelf ? 'bg-cyan-400/20 text-cyan-200' : 'bg-rose-500/25 text-rose-200'
            }`}
          >
            {label}
          </span>
          {room?.status === 'prep' ? (
            slot.ready ? (
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/25 px-2 py-0.5 text-[10px] font-extrabold text-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> 준비 완료
              </span>
            ) : (
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                재료 선택 중...
              </span>
            )
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-base font-black text-white">{slot.displayName}</div>
            <div className="text-[11px] font-bold text-teal-300">{slot.chefTitle}</div>
          </div>
          {tierMeta ? (
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-extrabold ${tierMeta.bgClass} ${tierMeta.textClass}`}
            >
              최고 {tierMeta.labelKo}
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex items-center gap-3 border-t border-white/10 pt-2 text-xs text-slate-200 tabular-nums">
          <span className="flex items-center gap-1 font-bold text-amber-300">
            <Trophy className="h-3.5 w-3.5" /> {slot.wins}승 {slot.losses}패
          </span>
          <span className="text-slate-500">|</span>
          <span className="font-bold text-cyan-200">최고 {slot.bestDishScore}점</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-amber-300/45 bg-[#082936] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-white">
                실시간 1:1 요리 대결
              </h2>
              <p className="text-xs text-cyan-200/80">
                {room
                  ? room.status === 'waiting'
                    ? `방 코드 ${room.roomId} · 참가자 대기 중`
                    : `방 코드 ${room.roomId} · 두 셰프가 동시에 대결 준비 중`
                  : '방을 만들거나 방 코드 · 랜덤 매칭으로 참가하세요.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCloseModal()}
            className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="tuvalu-scroll overflow-y-auto p-6 space-y-5">
          {errorMsg ? (
            <div className="rounded-2xl border border-rose-400/50 bg-rose-500/15 px-4 py-3 text-xs font-bold text-rose-200">
              {errorMsg}
            </div>
          ) : null}

          {/* Auth Required View */}
          {!isSignedIn ? (
            <div className="rounded-2xl border border-amber-300/40 bg-[#0c3747] p-6 text-center">
              <UserCheck className="mx-auto h-10 w-10 text-amber-300" />
              <h3 className="mt-3 font-display text-lg font-extrabold text-white">
                실시간 대결을 위해 Google 로그인이 필요합니다
              </h3>
              <p className="mt-1.5 text-xs text-slate-300">
                로그인하면 나의 셰프 프로필(닉네임, 전적, 최고 점수)이 실시간 방에 연동되어 상대와 겨룰 수 있습니다.
              </p>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void handleGoogleSignIn()}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-6 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300 cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                {signingIn ? '로그인 중...' : 'Google 로그인 후 입장하기'}
              </button>
            </div>
          ) : fishInventory.length === 0 && !room ? (
            /* No Fish Warning */
            <div className="rounded-2xl border border-dashed border-cyan-400/45 bg-slate-900/60 p-6 text-center">
              <h3 className="text-base font-extrabold text-white">
                대결에 사용할 물고기가 없습니다!
              </h3>
              <p className="mt-1.5 text-xs text-slate-300">
                먼저 외부 낚시터에서 물고기를 1마리 이상 낚아와야 요리 대결에 참가할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={onGoFishing}
                className="mt-4 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-cyan-300 cursor-pointer"
              >
                낚시터로 가기
              </button>
            </div>
          ) : !room ? (
            /* === LOBBY: CREATE ROOM vs JOIN ROOM (CODE or RANDOM MATCH) === */
            <div className="space-y-5">
              {/* My Profile Preview */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-300/35 bg-[#0c3747] px-5 py-3.5">
                <div>
                  <div className="text-[11px] font-bold text-teal-300">내 출전 프로필</div>
                  <div className="text-base font-black text-white">
                    {profile.displayName}{' '}
                    <span className="text-xs font-bold text-cyan-200">
                      ({getChefTitleForWins(profile.wins)})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold tabular-nums">
                  <span className="text-amber-300">{profile.wins}승 {profile.losses}패</span>
                  <span className="text-cyan-200">최고 점수 {profile.bestDishScore}점</span>
                  <span className="text-teal-200">보유 물고기 {fishInventory.length}마리</span>
                </div>
              </div>

              {/* Mode Switch Tabs: Join vs Create */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLobbyTab('join');
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-extrabold transition-colors cursor-pointer ${
                    lobbyTab === 'join'
                      ? 'border-amber-300 bg-amber-400 text-slate-950'
                      : 'border-white/15 bg-[#0c3747] text-slate-200 hover:bg-[#10465a]'
                  }`}
                >
                  <KeyRound className="h-4 w-4" /> 방 참가하기 (코드 / 랜덤)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLobbyTab('create');
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-extrabold transition-colors cursor-pointer ${
                    lobbyTab === 'create'
                      ? 'border-teal-300 bg-teal-400 text-slate-950'
                      : 'border-white/15 bg-[#0c3747] text-slate-200 hover:bg-[#10465a]'
                  }`}
                >
                  <PlusCircle className="h-4 w-4" /> 방 만들기 (호스트)
                </button>
              </div>

              {lobbyTab === 'join' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Join by Room Code */}
                  <div className="flex flex-col justify-between rounded-2xl border border-white/15 bg-[#0c3747] p-5">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                        <KeyRound className="h-4 w-4 text-amber-300" />
                        방 코드 입력하여 참가
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        상대방(호스트)에게 받은 6자리 방 코드를 입력하세요.
                      </p>
                      <input
                        type="text"
                        value={roomCodeInput}
                        maxLength={6}
                        onChange={(e) => setRoomCodeInput(normalizeRoomCode(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !busy) void handleJoinByCode();
                        }}
                        placeholder="예: K7M9P2"
                        className="mt-4 w-full rounded-xl border border-white/20 bg-slate-900 px-4 py-3 text-center font-mono text-xl font-black tracking-[0.25em] text-amber-300 placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || roomCodeInput.length < 6}
                      onClick={() => void handleJoinByCode()}
                      className={`mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold transition-colors ${
                        busy || roomCodeInput.length < 6
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer'
                      }`}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                      방 코드로 입장하기
                    </button>
                  </div>

                  {/* Random Real-Time Matchmaking */}
                  <div className="flex flex-col justify-between rounded-2xl border border-cyan-300/35 bg-gradient-to-br from-[#0e394a] to-[#172a45] p-5">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                        <Shuffle className="h-4 w-4 text-cyan-300" />
                        랜덤 실시간 매치
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">
                        현재 대기 중인 다른 플레이어와 즉시 매칭합니다. 대기 방이 없으면 자동으로 공개 대기방을 열어 상대를 기다립니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRandomMatch()}
                      className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 py-2.5 text-sm font-extrabold text-slate-950 hover:from-cyan-300 hover:to-teal-300 cursor-pointer"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                      랜덤 실시간 매치 시작!
                    </button>
                  </div>
                </div>
              ) : (
                /* Create Room */
                <div className="rounded-2xl border border-teal-300/35 bg-[#0c3747] p-5">
                  <h3 className="text-base font-extrabold text-white">새 대결 방 만들기</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    방을 만들면 6자리 방 코드가 발급되며, 참가자 1명이 더 들어올 때까지 대기실에서 기다립니다.
                  </p>

                  <label className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-xs font-bold text-cyan-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowRandomJoin}
                      onChange={(e) => setAllowRandomJoin(e.target.checked)}
                      className="h-4 w-4 accent-teal-400"
                    />
                    <span>랜덤 실시간 매치 플레이어도 이 방에 들어올 수 있도록 공개하기</span>
                  </label>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCreateRoom()}
                    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 py-3 text-sm font-black text-slate-950 hover:from-teal-300 hover:to-emerald-300 cursor-pointer"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                    대결 방 생성 &amp; 방 코드 발급받기
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* === INSIDE ROOM (WAITING FOR 1 MORE PLAYER OR BOTH IN PREP) === */
            <div className="space-y-5">
              {/* Host Room Code Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-300/50 bg-[#0d3544] p-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    {room.isMatchmaking ? '공개 매칭 방 코드' : '방 코드 (상대방에게 공유하세요)'}
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="rounded-xl bg-slate-950/80 px-4 py-1.5 font-mono text-2xl font-black tracking-[0.22em] text-amber-300 border border-amber-300/35">
                      {room.roomId}
                    </span>
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-extrabold text-cyan-100 hover:bg-slate-700 cursor-pointer"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? '복사됨!' : '코드 복사'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-slate-900/70 px-3 py-2 text-right text-xs">
                    <div className="font-bold text-teal-300">심사위원: {activeJudge.nameKo}</div>
                    <div className="text-[11px] text-slate-300">
                      선호: {activeJudge.preferredFlavors.map((t) => FLAVOR_LABELS[t].ko).join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLeaveRoom()}
                    className="flex items-center gap-1 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2.5 text-xs font-extrabold text-rose-200 hover:bg-rose-500/25 cursor-pointer"
                  >
                    <DoorOpen className="h-4 w-4" /> 방 나가기
                  </button>
                </div>
              </div>

              {/* Profiles Side-by-Side */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mySlot ? renderProfileCard(mySlot, role === 'host' ? '나 (방장)' : '나 (참가자)', true) : null}
                {room.status === 'waiting' || !oppSlot || !oppSlot.uid
                  ? renderProfileCard(
                      oppSlot ?? profile as unknown as BattlePlayerSlot,
                      '상대방',
                      false,
                      true,
                    )
                  : renderProfileCard(
                      oppSlot,
                      role === 'host' ? '상대방 (참가자)' : '상대방 (방장)',
                      false,
                    )}
              </div>

              {/* Fish & Ingredients Selection (available while waiting or in prep) */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="space-y-3 lg:col-span-6">
                  <h3 className="text-sm font-extrabold text-white">
                    1. 주재료 물고기 선택 ({fishInventory.length}마리 보유)
                  </h3>
                  <div className="tuvalu-scroll grid max-h-40 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {fishInventory.map((f) => {
                      const sp = FISH_CATALOG.find((c) => c.id === f.speciesId);
                      if (!sp) return null;
                      const tier = FISH_TIERS[sp.tier];
                      const active = selectedFish?.uid === f.uid;
                      return (
                        <button
                          key={f.uid}
                          type="button"
                          disabled={Boolean(mySlot?.ready)}
                          onClick={() => setSelectedFishUid(f.uid)}
                          className={`rounded-xl border p-2.5 text-left transition-colors ${
                            mySlot?.ready ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            active
                              ? 'border-amber-300 bg-amber-400/15'
                              : 'border-white/10 bg-[#0c3747] hover:border-teal-300/40'
                          }`}
                        >
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-extrabold ${tier.bgClass} ${tier.textClass}`}
                          >
                            {tier.labelKo}
                          </span>
                          <div className="mt-0.5 text-xs font-bold text-white">{sp.nameKo}</div>
                          <div className="text-[10px] text-slate-300">
                            {f.weightKg.toFixed(1)}kg · +{tier.dishQualityBonus}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 lg:col-span-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white">
                      2. 추가 식재료 선택 ({selectedIngIds.length}/3)
                    </h3>
                    {room.status === 'waiting' ? (
                      <button
                        type="button"
                        onClick={onOpenMarket}
                        className="flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-400/30 cursor-pointer"
                      >
                        <ShoppingBag className="h-3 w-3" /> 상점
                      </button>
                    ) : null}
                  </div>
                  {ownedIngredients.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 bg-slate-900/50 p-4 text-center text-xs text-slate-300">
                      추가 식재료가 없습니다. 순수 생선 요리로 출전하거나 상점에서 구입하세요.
                    </div>
                  ) : (
                    <div className="tuvalu-scroll grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                      {ownedIngredients.map((item) => {
                        const selected = selectedIngIds.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={Boolean(mySlot?.ready)}
                            onClick={() => toggleIngredient(item.id)}
                            className={`rounded-xl border p-2 text-left transition-colors ${
                              mySlot?.ready ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'
                            } ${
                              selected
                                ? 'border-teal-300 bg-teal-400/20'
                                : 'border-white/10 bg-[#0c3747] hover:border-white/30'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-bold text-teal-200">
                              <span>{CATEGORY_LABELS[item.category]}</span>
                              <span>x{pantry[item.id] ?? 0}</span>
                            </div>
                            <div className="mt-0.5 text-xs font-extrabold text-white line-clamp-1">
                              {item.nameKo}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Ready Action */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="text-xs text-cyan-100">
                  {selectedSpecies ? (
                    <>
                      예상 입맛 궁합:{' '}
                      <strong className="text-amber-300">{palatePreviewScore}점 / 100</strong>
                      {room.status === 'waiting'
                        ? ' · 참가자가 들어오면 준비 완료를 눌러 동시 시작할 수 있습니다.'
                        : mySlot?.ready && !oppSlot?.ready
                          ? ` · ${oppSlot?.displayName ?? '상대방'}의 준비 완료를 기다리는 중...`
                          : ' · 두 셰프 모두 준비 완료를 누르면 동시에 대결이 시작됩니다!'}
                    </>
                  ) : (
                    '출전할 물고기를 선택하세요.'
                  )}
                </div>

                {room.status === 'prep' ? (
                  <button
                    type="button"
                    disabled={busy || !selectedFish}
                    onClick={() => void handleToggleReady()}
                    className={`flex min-h-[46px] items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-black transition-colors cursor-pointer ${
                      mySlot?.ready
                        ? 'border border-emerald-400/60 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35'
                        : 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400'
                    }`}
                  >
                    <Flame className="h-4 w-4" />
                    {mySlot?.ready ? '준비 완료! (취소하려면 클릭)' : '대결 준비 완료!'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-400/15 border border-amber-300/35 px-4 py-2 text-xs font-bold text-amber-200">
                    <Loader2 className="h-4 w-4 animate-spin" /> 참가자 1명 대기 중...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
