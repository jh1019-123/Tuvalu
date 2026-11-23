import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Anchor,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  Fish,
  Info,
  ShoppingBag,
  Sparkles,
  Swords,
  Trophy,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { BattlePrepModal } from './components/BattlePrepModal';
import { CookingMinigameHUD } from './components/CookingMinigameHUD';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FishDexModal } from './components/FishDexModal';
import { FishingHUD } from './components/FishingHUD';
import { GatherMinigameHUD } from './components/GatherMinigameHUD';
import { JudgingOverlay } from './components/JudgingOverlay';
import { MarketModal } from './components/MarketModal';
import { MobileJoystick } from './components/MobileJoystick';
import { ProfileRankModal } from './components/ProfileRankModal';
import { SailingHUD } from './components/SailingHUD';
import { TitleScreen } from './components/TitleScreen';
import {
  FISH_CATALOG,
  FISH_TIERS,
  INGREDIENT_CATALOG,
  OUTER_ISLANDS,
  RIVAL_CHEFS,
  TIER_ORDER,
  TUVALU_JUDGES,
  TUVALU_TIPS,
  rollRandomFish,
} from './data/tuvaluData';
import {
  auth,
  loadUserProfile,
  publishToLeaderboard,
  saveUserProfile,
  signInWithGoogle,
  signOutUser,
} from './services/firebase';
import { SailingTelemetry, TuvaluWorld } from './three/TuvaluWorld';
import {
  BattlePlan,
  BattleVerdict,
  CaughtFish,
  CookingStage,
  CookingStageScores,
  FishSpecies,
  FishingPhase,
  GameScreen,
  IngredientItem,
  IslandId,
  MapZone,
  UserProfileData,
} from './types/game';

const LOCAL_INV_KEY = 'tuvalu_laguna_chef_inv_v1';
const GATHER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes per rare ingredient

function formatCooldownKo(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

interface FishDexRecord {
  count: number;
  maxWeight: number;
}

function loadLocalInventory(): {
  fishInventory: CaughtFish[];
  pantry: Record<string, number>;
  gatherCooldowns: Record<string, number>;
  caughtSpeciesIds: string[];
  fishDexRecords: Record<string, FishDexRecord>;
  guestProfile: UserProfileData;
} {
  try {
    const raw = localStorage.getItem(LOCAL_INV_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fishInventory: Array.isArray(parsed.fishInventory) ? parsed.fishInventory : [],
        pantry: parsed.pantry && typeof parsed.pantry === 'object' ? parsed.pantry : { funafuti_seasalt: 1 },
        gatherCooldowns:
          parsed.gatherCooldowns && typeof parsed.gatherCooldowns === 'object' ? parsed.gatherCooldowns : {},
        caughtSpeciesIds: Array.isArray(parsed.caughtSpeciesIds) ? parsed.caughtSpeciesIds : [],
        fishDexRecords:
          parsed.fishDexRecords && typeof parsed.fishDexRecords === 'object' ? parsed.fishDexRecords : {},
        guestProfile: parsed.guestProfile ?? {
          uid: 'guest',
          displayName: '푸나푸티 셰프',
          wins: 0,
          losses: 0,
          totalBattles: 0,
          coins: 80,
          fishCaughtCount: 0,
          bestDishScore: 0,
          rarestFishTier: 'none',
        },
      };
    }
  } catch {
    // ignore corrupted localStorage
  }
  return {
    fishInventory: [],
    pantry: { funafuti_seasalt: 1 },
    gatherCooldowns: {},
    caughtSpeciesIds: [],
    fishDexRecords: {},
    guestProfile: {
      uid: 'guest',
      displayName: '푸나푸티 셰프',
      wins: 0,
      losses: 0,
      totalBattles: 0,
      coins: 80,
      fishCaughtCount: 0,
      bestDishScore: 0,
      rarestFishTier: 'none',
    },
  };
}

function GameApp() {
  const initialData = useRef(loadLocalInventory());
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<TuvaluWorld | null>(null);

  const [screen, setScreen] = useState<GameScreen>('title');
  const [zone, setZone] = useState<MapZone>('fishing');
  const [currentIslandId, setCurrentIslandId] = useState<IslandId>('funafuti');
  const [dockOpen, setDockOpen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [nearStation, setNearStation] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

  // Sailing & Outer Island Gathering
  const [sailingTarget, setSailingTarget] = useState<IslandId>('nanumea');
  const [autoSail, setAutoSail] = useState(false);
  const [sailingTelemetry, setSailingTelemetry] = useState<SailingTelemetry>({
    target: 'nanumea',
    distance: 180,
    etaSeconds: 30,
    arrivedIsland: null,
  });
  const [activeGather, setActiveGather] = useState<{
    ingredient: IngredientItem;
    islandNameKo: string;
  } | null>(null);

  // Modals
  const [activeModal, setActiveModal] = useState<'none' | 'market' | 'prep' | 'profile' | 'guide' | 'dex'>('none');

  // Player Profile & Auth
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileData>(initialData.current.guestProfile);
  const [profileInCloud, setProfileInCloud] = useState(false);
  const [publishingRank, setPublishingRank] = useState(false);
  const [rankStatusMsg, setRankStatusMsg] = useState<string | null>(null);

  // Inventory, Cooldowns & Fish Dex
  const [fishInventory, setFishInventory] = useState<CaughtFish[]>(initialData.current.fishInventory);
  const [pantry, setPantry] = useState<Record<string, number>>(initialData.current.pantry);
  const [gatherCooldowns, setGatherCooldowns] = useState<Record<string, number>>(
    initialData.current.gatherCooldowns,
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [caughtSpeciesIds, setCaughtSpeciesIds] = useState<string[]>(initialData.current.caughtSpeciesIds);
  const [fishDexRecords, setFishDexRecords] = useState<Record<string, FishDexRecord>>(
    initialData.current.fishDexRecords,
  );

  // Fishing State
  const [fishingPhase, setFishingPhase] = useState<FishingPhase>('idle');
  const [lastCaught, setLastCaught] = useState<{
    species: FishSpecies;
    weightKg: number;
    coins: number;
  } | null>(null);
  const biteTimerRef = useRef<number | null>(null);
  const missTimerRef = useRef<number | null>(null);

  // Cooking Battle State
  const [judgeIdx, setJudgeIdx] = useState(0);
  const [rivalIdx, setRivalIdx] = useState(0);
  const [battlePlan, setBattlePlan] = useState<BattlePlan | null>(null);
  const [cookingStage, setCookingStage] = useState<CookingStage>('none');
  const [stageScores, setStageScores] = useState<CookingStageScores>({ wash: 0, prep: 0, cook: 0 });
  const [verdict, setVerdict] = useState<BattleVerdict | null>(null);
  const [rankPublishedThisBattle, setRankPublishedThisBattle] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Cooldown 1s clock & 3D node sync
  useEffect(() => {
    const syncNodes = () => {
      const t = Date.now();
      setNowMs(t);
      const map: Record<string, boolean> = {};
      Object.entries(gatherCooldowns).forEach(([id, until]) => {
        if (until > t) map[id] = true;
      });
      worldRef.current?.setGatherCooldowns(map);
    };
    syncNodes();
    const hasActiveCd = Object.values(gatherCooldowns).some((until) => until > Date.now());
    if (!hasActiveCd && zone !== 'island') return;
    const iv = window.setInterval(syncNodes, 1000);
    return () => clearInterval(iv);
  }, [gatherCooldowns, zone]);

  // Persist local inventory, cooldowns & guest state
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_INV_KEY,
        JSON.stringify({
          fishInventory,
          pantry,
          gatherCooldowns,
          caughtSpeciesIds,
          fishDexRecords,
          guestProfile: profile,
        }),
      );
    } catch {
      // ignore storage quota
    }
  }, [fishInventory, pantry, gatherCooldowns, caughtSpeciesIds, fishDexRecords, profile]);

  // Firebase Auth listener (serialized via authSyncPromiseRef to prevent signIn+publish races)
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const authSyncPromiseRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        const job = (async () => {
          try {
            const existing = await loadUserProfile(user.uid);
            const local = profileRef.current;
            if (existing) {
              const mergedWins = Math.max(existing.wins, local.wins);
              const mergedLosses = Math.max(existing.losses, local.losses);
              const mergedTier =
                TIER_ORDER[local.rarestFishTier] > TIER_ORDER[existing.rarestFishTier]
                  ? local.rarestFishTier
                  : existing.rarestFishTier;
              const merged: UserProfileData = {
                uid: user.uid,
                displayName: existing.displayName || local.displayName || '투발루 셰프',
                wins: mergedWins,
                losses: mergedLosses,
                totalBattles: mergedWins + mergedLosses,
                coins: Math.max(existing.coins, local.coins),
                fishCaughtCount: Math.max(existing.fishCaughtCount, local.fishCaughtCount),
                bestDishScore: Math.max(existing.bestDishScore, local.bestDishScore),
                rarestFishTier: mergedTier,
              };
              setProfile(merged);
              setProfileInCloud(true);
              if (
                merged.wins > existing.wins ||
                merged.losses > existing.losses ||
                merged.coins > existing.coins ||
                merged.bestDishScore > existing.bestDishScore
              ) {
                await saveUserProfile(merged, false, false);
              }
            } else {
              const initialCloud: UserProfileData = {
                ...local,
                uid: user.uid,
                displayName: (user.displayName || local.displayName || '투발루 셰프').slice(0, 40),
              };
              await saveUserProfile(initialCloud, true, false);
              setProfile(initialCloud);
              setProfileInCloud(true);
            }
          } catch (err) {
            console.error('Failed to sync user profile:', err);
          }
        })();
        authSyncPromiseRef.current = job;
      } else {
        setProfileInCloud(false);
      }
    });
    return () => unsub();
  }, []);

  const syncProfileToCloud = useCallback(
    async (nextProfile: UserProfileData) => {
      if (!authUser || !profileInCloud) return;
      try {
        await saveUserProfile(nextProfile, false, false);
      } catch (err) {
        console.error('Profile save error:', err);
      }
    },
    [authUser, profileInCloud],
  );

  // Refs for stable Three.js callbacks
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const fishingPhaseRef = useRef(fishingPhase);
  fishingPhaseRef.current = fishingPhase;
  const activeModalRef = useRef(activeModal);
  activeModalRef.current = activeModal;
  const activeGatherRef = useRef(activeGather);
  activeGatherRef.current = activeGather;
  const gatherCooldownsRef = useRef(gatherCooldowns);
  gatherCooldownsRef.current = gatherCooldowns;

  const handleZoneChange = useCallback((nextZone: MapZone) => {
    if (fishingPhaseRef.current !== 'idle') return;
    worldRef.current?.setVirtualMove(0, 0);
    worldRef.current?.setGatheringActive(false);
    setActiveGather(null);
    setZone(nextZone);
    if (nextZone === 'fishing' || nextZone === 'kitchen') {
      setCurrentIslandId('funafuti');
    }
    worldRef.current?.setZone(nextZone);
    soundEngine.playClick();
  }, []);

  const launchBoat = useCallback(
    (target?: IslandId) => {
      if (fishingPhaseRef.current !== 'idle') return;
      const currentIsl = worldRef.current?.getCurrentIsland() ?? 'funafuti';
      const nextTarget: IslandId =
        target ?? (currentIsl === 'funafuti' ? 'nanumea' : 'funafuti');
      worldRef.current?.setVirtualMove(0, 0);
      worldRef.current?.setGatheringActive(false);
      setActiveGather(null);
      setAutoSail(false);
      setSailingTarget(nextTarget);
      setZone('sailing');
      worldRef.current?.startSailing(nextTarget);
      soundEngine.playSplash();
      showToast('선착장에서 배에 탑승하여 항해를 시작합니다!');
    },
    [showToast],
  );

  const openGatherByAction = useCallback(
    (action: string) => {
      // action format: gather_node:<islandId>:<ingredientId>
      const parts = action.split(':');
      const islandId = parts[1];
      const ingId = parts[2];
      const ing = INGREDIENT_CATALOG.find((i) => i.id === ingId);
      const isl = OUTER_ISLANDS.find((i) => i.id === islandId);
      if (!ing || !isl) return;

      const until = gatherCooldownsRef.current[ing.id] ?? 0;
      const rem = until - Date.now();
      if (rem > 0) {
        showToast(`${ing.nameKo}은(는) ${formatCooldownKo(rem)} 후에 다시 채집할 수 있습니다.`);
        return;
      }

      worldRef.current?.setVirtualMove(0, 0);
      worldRef.current?.setGatheringActive(true, ing.id);
      setActiveGather({ ingredient: ing, islandNameKo: isl.nameKo });
      soundEngine.playClick();
    },
    [showToast],
  );

  const startFishing = useCallback(() => {
    if (fishingPhaseRef.current !== 'idle' || zoneRef.current !== 'fishing') return;
    if (biteTimerRef.current) clearTimeout(biteTimerRef.current);
    if (missTimerRef.current) clearTimeout(missTimerRef.current);

    worldRef.current?.setVirtualMove(0, 0);
    soundEngine.playCast();
    setFishingPhase('casting');
    worldRef.current?.setFishingPhase('casting');

    window.setTimeout(() => {
      soundEngine.playSplash();
      setFishingPhase('waiting');
      worldRef.current?.setFishingPhase('waiting');

      const waitMs = 1300 + Math.random() * 1900;
      biteTimerRef.current = window.setTimeout(() => {
        soundEngine.playBiteAlert();
        setFishingPhase('biting');
        worldRef.current?.setFishingPhase('biting');

        missTimerRef.current = window.setTimeout(() => {
          setFishingPhase((curr) => {
            if (curr === 'biting') {
              worldRef.current?.setFishingPhase('idle');
              showToast('앗! 물고기가 미끼만 먹고 도망갔습니다.');
              return 'idle';
            }
            return curr;
          });
        }, 2800);
      }, waitMs);
    }, 350);
  }, [showToast]);

  // Mount Three.js World once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const world = new TuvaluWorld(el, {
      onZoneAutoSwitch: (z) => {
        if (fishingPhaseRef.current !== 'idle') return;
        setZone(z);
        if (z === 'fishing' || z === 'kitchen') setCurrentIslandId('funafuti');
        world.setZone(z);
      },
      onAutoBoardBoat: (target) => {
        setAutoSail(false);
        setSailingTarget(target);
        setZone('sailing');
        soundEngine.playSplash();
        showToast('선착장 끝에서 배에 탑승해 항해를 시작합니다!');
      },
      onNearStationChange: (st) => {
        setNearStation(st);
      },
      onSailingUpdate: (info) => {
        setSailingTelemetry(info);
        if (info.arrivedIsland) {
          setAutoSail(false);
          setCurrentIslandId(info.arrivedIsland);
          if (info.arrivedIsland === 'funafuti') {
            setZone('fishing');
            showToast('푸나푸티 본섬 선착장에 도착했습니다!');
          } else {
            setZone('island');
            const isl = OUTER_ISLANDS.find((i) => i.id === info.arrivedIsland);
            showToast(`${isl?.nameKo ?? '외곽 섬'} 선착장에 상륙했습니다! 희귀 재료를 채집하세요.`);
          }
          soundEngine.playSplash();
        }
      },
      onStationClick: (action) => {
        if (screenRef.current !== 'playing' || activeModalRef.current !== 'none') return;
        if (fishingPhaseRef.current !== 'idle' || activeGatherRef.current) return;
        if (action === 'cast_or_fish') {
          if (zoneRef.current !== 'fishing') {
            setZone('fishing');
            setCurrentIslandId('funafuti');
            world.setZone('fishing');
          }
          startFishing();
        } else if (action === 'enter_kitchen') {
          setZone('kitchen');
          setCurrentIslandId('funafuti');
          world.setZone('kitchen');
        } else if (action === 'market') {
          setActiveModal('market');
        } else if (action === 'battle') {
          setActiveModal('prep');
        } else if (action === 'board_boat') {
          launchBoat();
        } else if (action.startsWith('gather_node:')) {
          openGatherByAction(action);
        }
      },
    });
    worldRef.current = world;

    return () => {
      if (biteTimerRef.current) clearTimeout(biteTimerRef.current);
      if (missTimerRef.current) clearTimeout(missTimerRef.current);
      world.dispose();
      worldRef.current = null;
    };
  }, [startFishing, launchBoat, openGatherByAction, showToast]);

  // Sync Screen Mode to 3D World
  useEffect(() => {
    worldRef.current?.setScreenMode(screen);
  }, [screen]);

  const handleHookBite = useCallback(() => {
    if (missTimerRef.current) clearTimeout(missTimerRef.current);
    soundEngine.playReelTick();
    setFishingPhase('reeling');
    worldRef.current?.setFishingPhase('reeling');
  }, []);

  const handleReelComplete = useCallback(
    (success: boolean) => {
      if (!success) {
        setFishingPhase('idle');
        worldRef.current?.setFishingPhase('idle');
        showToast('줄이 끊어졌습니다! 다시 낚싯대를 던져보세요.');
        return;
      }

      const species = rollRandomFish();
      const tierMeta = FISH_TIERS[species.tier];
      const weightKg = Number((0.6 + Math.random() * 4.5 * species.scaleFactor).toFixed(1));
      const coins = tierMeta.coinReward;

      const caughtEntry: CaughtFish = {
        uid: `fish_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        speciesId: species.id,
        weightKg,
        caughtAt: Date.now(),
      };

      setFishInventory((prev) => [caughtEntry, ...prev]);
      setCaughtSpeciesIds((prev) => (prev.includes(species.id) ? prev : [...prev, species.id]));
      setFishDexRecords((prev) => {
        const existing = prev[species.id];
        return {
          ...prev,
          [species.id]: {
            count: (existing?.count ?? 0) + 1,
            maxWeight: Math.max(existing?.maxWeight ?? 0, weightKg),
          },
        };
      });
      setLastCaught({ species, weightKg, coins });
      setFishingPhase('caught');
      worldRef.current?.setFishingPhase('caught', species);
      worldRef.current?.triggerShake(species.tier === 'mythic' || species.tier === 'legendary' ? 0.35 : 0.15);
      soundEngine.playCatchFanfare(species.tier);

      setProfile((prev) => {
        const nextTier =
          TIER_ORDER[species.tier] > TIER_ORDER[prev.rarestFishTier]
            ? species.tier
            : prev.rarestFishTier;
        const updated: UserProfileData = {
          ...prev,
          coins: prev.coins + coins,
          fishCaughtCount: prev.fishCaughtCount + 1,
          rarestFishTier: nextTier,
        };
        void syncProfileToCloud(updated);
        return updated;
      });
    },
    [showToast, syncProfileToCloud],
  );

  const handleCloseCatch = useCallback(() => {
    setFishingPhase('idle');
    setLastCaught(null);
    worldRef.current?.setFishingPhase('idle');
  }, []);

  // Gather Minigame Complete (10-minute cooldown per rare ingredient)
  const handleGatherComplete = useCallback(
    (qty: number) => {
      if (!activeGather) return;
      const ing = activeGather.ingredient;
      worldRef.current?.setGatheringActive(false);
      worldRef.current?.triggerGatherHitBurst(ing.id);
      setPantry((prev) => ({
        ...prev,
        [ing.id]: (prev[ing.id] ?? 0) + qty,
      }));
      setGatherCooldowns((prev) => ({
        ...prev,
        [ing.id]: Date.now() + GATHER_COOLDOWN_MS,
      }));
      soundEngine.playCoin();
      showToast(`${ing.nameKo} ${qty}개 채집 완료! (10분 후 재채집 가능)`);
      setActiveGather(null);
    },
    [activeGather, showToast],
  );

  // Market Buy
  const handleBuyIngredient = useCallback(
    (item: IngredientItem) => {
      if (item.isRare || profile.coins < item.price) return;
      soundEngine.playCoin();
      setPantry((prev) => ({
        ...prev,
        [item.id]: (prev[item.id] ?? 0) + 1,
      }));
      setProfile((prev) => {
        const updated = { ...prev, coins: prev.coins - item.price };
        void syncProfileToCloud(updated);
        return updated;
      });
      showToast(`${item.nameKo} 1개를 구입했습니다!`);
    },
    [profile.coins, showToast, syncProfileToCloud],
  );

  // Start Cooking Battle
  const handleStartBattle = useCallback((plan: BattlePlan) => {
    setFishInventory((prev) => prev.filter((f) => f.uid !== plan.fish.uid));
    setPantry((prev) => {
      const next = { ...prev };
      plan.ingredientIds.forEach((id) => {
        if ((next[id] ?? 0) > 0) next[id] = next[id] - 1;
      });
      return next;
    });

    worldRef.current?.setVirtualMove(0, 0);
    setActiveModal('none');
    setCurrentIslandId('funafuti');
    setZone('kitchen');
    worldRef.current?.setZone('kitchen');
    setBattlePlan(plan);
    setStageScores({ wash: 0, prep: 0, cook: 0 });
    setVerdict(null);
    setRankPublishedThisBattle(false);
    setCookingStage('wash');
    worldRef.current?.setCookingStage('wash', plan.fishSpecies, 0.5, plan.ingredientIds, plan.rival);
    soundEngine.playClick();
  }, []);

  const finalizeJudging = useCallback(
    (plan: BattlePlan, finalScores: CookingStageScores) => {
      const minigameAvg = finalScores.wash * 0.25 + finalScores.prep * 0.35 + finalScores.cook * 0.4;
      const tierBonus = FISH_TIERS[plan.fishSpecies.tier].dishQualityBonus;
      const playerPerfection = Math.min(100, Math.round(minigameAvg * 0.72 + tierBonus));

      let palate = 35;
      plan.fishSpecies.flavorTags.forEach((tag) => {
        if (plan.judge.preferredFlavors.includes(tag)) palate += 12;
      });
      plan.ingredientIds.forEach((id) => {
        const ing = INGREDIENT_CATALOG.find((i) => i.id === id);
        if (!ing) return;
        palate += Math.round(ing.palateBonus * 0.65);
        ing.flavorTags.forEach((t) => {
          if (plan.judge.preferredFlavors.includes(t)) palate += 9;
        });
      });
      if (TIER_ORDER[plan.fishSpecies.tier] >= TIER_ORDER[plan.judge.preferredTierMin]) {
        palate += 8;
      }
      const playerPalateMatch = Math.min(100, palate);
      const playerTotal = playerPerfection + playerPalateMatch;

      const rivalPerfection = Math.min(
        97,
        Math.max(45, Math.round(plan.rival.baseSkill + (Math.random() * 12 - 5))),
      );
      const rivalPalateMatch = Math.min(
        96,
        Math.max(45, Math.round(plan.rival.palateAffinity + (Math.random() * 12 - 5))),
      );
      const rivalTotal = rivalPerfection + rivalPalateMatch;

      const won = playerTotal > rivalTotal;
      const isDraw = playerTotal === rivalTotal;
      const rewardCoins = won ? 120 + Math.round(playerTotal * 0.4) : isDraw ? 70 : 30;

      const dishNameKo = `${plan.fishSpecies.nameKo} 투발루 로로 스페셜`;
      let judgeCommentKo = '';
      if (won) {
        judgeCommentKo = `정말 훌륭하오! ${plan.fishSpecies.nameKo}의 신선함이 완벽한 손질과 불 조절을 만나 내 입맛에 딱 맞는 최고의 투발루 요리가 완성되었네!`;
      } else if (isDraw) {
        judgeCommentKo = `두 셰프 모두 놀라운 실력이로군! 한 끗 차이의 명승부였네. 다음에는 더 귀한 생선과 향신료를 조합해보게나.`;
      } else {
        judgeCommentKo = `${plan.rival.nameKo}의 요리가 조금 더 내 입맛과 완성도에 가까웠네. 상점이나 외곽 섬에서 희귀 재료를 모아 다시 도전해보게!`;
      }

      const nextVerdict: BattleVerdict = {
        playerPerfection,
        playerPalateMatch,
        playerTotal,
        rivalPerfection,
        rivalPalateMatch,
        rivalTotal,
        won,
        isDraw,
        rewardCoins,
        judgeCommentKo,
        dishNameKo,
      };

      setVerdict(nextVerdict);
      setCookingStage('result');
      worldRef.current?.setCookingStage('result', plan.fishSpecies, 0.5, plan.ingredientIds, plan.rival);
      worldRef.current?.setBattleOutcome(won ? 'won' : isDraw ? 'draw' : 'lost');

      if (won) {
        soundEngine.playVictory();
        worldRef.current?.triggerKitchenBurst('judging', 0xfbbf24);
      } else {
        soundEngine.playDefeat();
      }

      setProfile((prev) => {
        const nextWins = prev.wins + (won ? 1 : 0);
        const nextLosses = prev.losses + (won || isDraw ? 0 : 1);
        const updated: UserProfileData = {
          ...prev,
          wins: nextWins,
          losses: nextLosses,
          totalBattles: nextWins + nextLosses,
          coins: prev.coins + rewardCoins,
          bestDishScore: Math.max(prev.bestDishScore, playerTotal),
        };
        void syncProfileToCloud(updated);
        return updated;
      });
    },
    [syncProfileToCloud],
  );

  const handleStageComplete = useCallback(
    (completed: 'wash' | 'prep' | 'cook', score: number) => {
      if (!battlePlan) return;
      const updatedScores = { ...stageScores, [completed]: score };
      setStageScores(updatedScores);

      if (completed === 'wash') {
        setCookingStage('prep');
        worldRef.current?.setCookingStage('prep', battlePlan.fishSpecies, 0.5, battlePlan.ingredientIds, battlePlan.rival);
      } else if (completed === 'prep') {
        setCookingStage('cook');
        worldRef.current?.setCookingStage('cook', battlePlan.fishSpecies, 0.55, battlePlan.ingredientIds, battlePlan.rival);
      } else if (completed === 'cook') {
        setCookingStage('judging');
        worldRef.current?.setCookingStage('judging', battlePlan.fishSpecies, 0.5, battlePlan.ingredientIds, battlePlan.rival);
        window.setTimeout(() => {
          finalizeJudging(battlePlan, updatedScores);
        }, 1800);
      }
    },
    [battlePlan, stageScores, finalizeJudging],
  );

  const handleFinishBattle = useCallback(() => {
    setCookingStage('none');
    setBattlePlan(null);
    setVerdict(null);
    worldRef.current?.setBattleOutcome('none');
    worldRef.current?.setCookingStage('none');
    setJudgeIdx((i) => (i + 1) % TUVALU_JUDGES.length);
    setRivalIdx((i) => (i + 1) % RIVAL_CHEFS.length);
  }, []);

  // Auth & Leaderboard Publish
  const handleSignIn = useCallback(async () => {
    try {
      const user = await signInWithGoogle();
      setRankStatusMsg(`환영합니다, ${user.displayName ?? '셰프'}님! 개인정보가 클라우드에 연결되었습니다.`);
      showToast('Google 로그인 완료! 승리 수가 저장됩니다.');
    } catch (err) {
      console.error('Sign in failed:', err);
      showToast('로그인 창이 닫혔거나 실패했습니다.');
    }
  }, [showToast]);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    setRankStatusMsg('로그아웃되었습니다.');
  }, []);

  const handleUpdateDisplayName = useCallback(
    async (name: string) => {
      const clean = name.trim().slice(0, 40) || '투발루 셰프';
      const updated = { ...profile, displayName: clean };
      setProfile(updated);
      await syncProfileToCloud(updated);
      setRankStatusMsg('셰프 닉네임이 저장되었습니다.');
    },
    [profile, syncProfileToCloud],
  );

  const handlePublishRank = useCallback(async () => {
    if (!authUser) {
      await handleSignIn();
      return;
    }
    setPublishingRank(true);
    try {
      await authSyncPromiseRef.current;
      const current = { ...profileRef.current, uid: authUser.uid };
      const synced = await publishToLeaderboard(current);
      setProfile(synced);
      setProfileInCloud(true);
      setRankPublishedThisBattle(true);
      setRankStatusMsg(`승리 수(${synced.wins}승)가 투발루 셰프 랭킹에 등록되었습니다!`);
      showToast('투발루 셰프 랭킹에 승리 수가 등록되었습니다!');
    } catch (err) {
      console.error('Publish rank failed:', err);
      const detail = err instanceof Error ? err.message : String(err);
      setRankStatusMsg('랭킹 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      showToast(`랭킹 등록 실패: ${detail.slice(0, 60)}`);
    } finally {
      setPublishingRank(false);
    }
  }, [authUser, handleSignIn, showToast]);

  const handleSignInAndPublish = useCallback(async () => {
    try {
      const user = await signInWithGoogle();
      setPublishingRank(true);
      await authSyncPromiseRef.current;
      const base = profileRef.current;
      const current: UserProfileData = {
        ...base,
        uid: user.uid,
        displayName: (user.displayName || base.displayName || '투발루 셰프').slice(0, 40),
      };
      const synced = await publishToLeaderboard(current);
      setProfile(synced);
      setProfileInCloud(true);
      setRankPublishedThisBattle(true);
      setRankStatusMsg(`승리 수(${synced.wins}승)가 투발루 셰프 랭킹에 등록되었습니다!`);
      showToast('로그인 및 투발루 랭킹 등록 완료!');
    } catch (err) {
      console.error('Sign in and publish failed:', err);
      showToast('로그인 또는 랭킹 등록 중 오류가 발생했습니다.');
    } finally {
      setPublishingRank(false);
    }
  }, [showToast]);

  // Global Keyboard Shortcuts during playing:
  // - KeyE ONLY casts fishing rod in fishing zone (or interacts with dock / gather node)
  // - Space ALWAYS jumps during free walking (and NEVER casts the rod!)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (screen !== 'playing') return;

      if (e.code === 'Escape' && activeModal !== 'none') {
        e.preventDefault();
        setActiveModal('none');
        return;
      }

      if (e.code === 'KeyH' && cookingStage === 'none' && fishingPhase === 'idle' && !activeGather) {
        e.preventDefault();
        setDockOpen((o) => !o);
        return;
      }

      const inFreePlay =
        activeModal === 'none' && cookingStage === 'none' && fishingPhase === 'idle' && !activeGather;

      // Space jumps during free walking (except sailing)
      if (e.code === 'Space' && inFreePlay && zone !== 'sailing') {
        e.preventDefault();
        worldRef.current?.triggerJump();
        return;
      }

      // E key casts fishing rod or interacts with nearby dock/gather node/kitchen station
      if (e.code === 'KeyE' && inFreePlay && zone !== 'sailing') {
        e.preventDefault();
        if (zone === 'fishing') {
          if (nearStation === 'boat_dock') {
            launchBoat();
          } else {
            startFishing();
          }
        } else if (zone === 'island') {
          if (nearStation === 'boat_dock') {
            launchBoat('funafuti');
          } else if (nearStation && nearStation.startsWith('gather_node:')) {
            openGatherByAction(nearStation);
          } else {
            showToast('희귀 재료 결정 근처로 다가가서 E 키를 누르세요!');
          }
        } else if (zone === 'kitchen') {
          if (nearStation === 'market_stall') {
            setActiveModal('market');
          } else {
            setActiveModal('prep');
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    screen,
    activeModal,
    cookingStage,
    fishingPhase,
    activeGather,
    zone,
    nearStation,
    startFishing,
    launchBoat,
    openGatherByAction,
    showToast,
  ]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const canOpenOverlay = fishingPhase === 'idle' && cookingStage === 'none' && !activeGather;

  const currentZoneLabel =
    zone === 'fishing'
      ? '푸나푸티 낚시터'
      : zone === 'kitchen'
        ? '내부 조리실'
        : zone === 'sailing'
          ? '라군 배 항해 중'
          : OUTER_ISLANDS.find((i) => i.id === currentIslandId)?.nameKo ?? '외곽 섬';

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#062835]">
      {/* Isolated 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="fixed inset-0 h-full w-full" />

      {/* Title Screen */}
      {screen === 'title' ? (
        <TitleScreen
          onStart={() => {
            soundEngine.playClick();
            setScreen('playing');
          }}
          onOpenRank={() => {
            soundEngine.playClick();
            setActiveModal('profile');
          }}
        />
      ) : null}

      {/* Playing HUD (Low-occlusion, pointer-events-none wrapper) */}
      {screen === 'playing' ? (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-4">
          {/* Top Bar */}
          <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
            {/* Top-Left Compact Status Cluster */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2 rounded-2xl border border-teal-300/30 bg-[#072633]/90 px-3 sm:px-4 py-2 shadow-lg">
              <span className="rounded-lg bg-teal-400/20 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-extrabold text-teal-200">
                {currentZoneLabel}
              </span>
              <span className="tabular-nums text-xs sm:text-sm font-black text-amber-300">
                {profile.coins} T$
              </span>
              <span className="text-slate-500">|</span>
              <span className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-cyan-100 tabular-nums">
                <Fish className="h-3.5 w-3.5 text-cyan-300" /> {fishInventory.length}
              </span>
              <span className="text-slate-500">|</span>
              <span className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-amber-200 tabular-nums">
                <Trophy className="h-3.5 w-3.5 text-amber-300" /> {profile.wins}승
              </span>
            </div>

            {/* Top-Right Utility Controls */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={!canOpenOverlay}
                onClick={() => canOpenOverlay && setActiveModal('dex')}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors ${
                  canOpenOverlay
                    ? 'border-cyan-300/40 bg-[#072633]/90 text-cyan-100 hover:bg-[#0c3a4c] cursor-pointer'
                    : 'border-white/10 bg-[#072633]/50 text-slate-400 cursor-not-allowed'
                }`}
              >
                <BookOpen className="h-4 w-4 text-cyan-300" />
                <span>물고기 도감 ({caughtSpeciesIds.length}/{FISH_CATALOG.length})</span>
              </button>

              <button
                type="button"
                disabled={!canOpenOverlay}
                onClick={() => {
                  if (!canOpenOverlay) return;
                  setTipIndex((i) => (i + 1) % TUVALU_TIPS.length);
                  setActiveModal('guide');
                }}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  canOpenOverlay
                    ? 'border-white/15 bg-[#072633]/90 text-cyan-100 hover:bg-[#0c3a4c] cursor-pointer'
                    : 'border-white/10 bg-[#072633]/50 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Info className="h-4 w-4 text-teal-300" />
                <span className="hidden sm:inline">투발루 소개</span>
              </button>

              <button
                type="button"
                disabled={!canOpenOverlay}
                onClick={() => canOpenOverlay && setActiveModal('profile')}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors ${
                  canOpenOverlay
                    ? 'border-amber-300/40 bg-[#072633]/90 text-amber-200 hover:bg-[#0c3a4c] cursor-pointer'
                    : 'border-white/10 bg-[#072633]/50 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Trophy className="h-4 w-4 text-amber-300" />
                <span>내 정보 · 랭킹</span>
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-white/15 bg-[#072633]/90 p-2 text-slate-200 hover:bg-[#0c3a4c] cursor-pointer"
                aria-label={muted ? '소리 켜기' : '음소거'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Toast Notification */}
          {toast ? (
            <div className="self-center rounded-full border border-amber-300/50 bg-[#072633]/95 px-5 py-2 text-center text-xs font-bold text-amber-200 shadow-xl">
              {toast}
            </div>
          ) : null}

          {/* Outer Island Rare Ingredient Cooldown Status Pill */}
          {screen === 'playing' && zone === 'island' && !activeGather ? (
            <div className="pointer-events-auto self-center rounded-2xl border border-amber-300/35 bg-[#072633]/92 px-4 py-2 shadow-xl">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
                {(OUTER_ISLANDS.find((i) => i.id === currentIslandId)?.rareIngredientIds ?? []).map((ingId) => {
                  const ing = INGREDIENT_CATALOG.find((i) => i.id === ingId);
                  if (!ing) return null;
                  const rem = (gatherCooldowns[ingId] ?? 0) - nowMs;
                  return (
                    <div key={ingId} className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{ing.nameKo}</span>
                      {rem > 0 ? (
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-300">
                          {formatCooldownKo(rem)} 후 채집
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-500/25 px-2 py-0.5 text-[11px] font-extrabold text-emerald-200">
                          채집 가능
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Mobile Touch Joystick (works for both walking & boat steering!) */}
          {canOpenOverlay && activeModal === 'none' ? (
            <MobileJoystick onMove={(x, z) => worldRef.current?.setVirtualMove(x, z)} />
          ) : null}

          {/* Mobile / Quick Jump Button (bottom-right) */}
          {canOpenOverlay && activeModal === 'none' && zone !== 'sailing' ? (
            <button
              type="button"
              onPointerDown={() => worldRef.current?.triggerJump()}
              className="pointer-events-auto fixed bottom-24 right-4 z-30 flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-teal-300/60 bg-[#072633]/90 text-xs font-extrabold text-teal-100 shadow-xl active:scale-95 cursor-pointer"
              aria-label="점프"
            >
              <ArrowUp className="h-5 w-5 text-teal-300" />
              <span className="text-[10px]">점프</span>
            </button>
          ) : null}

          {/* Collapsible Bottom Control Dock (Hidden while sailing, since SailingHUD takes bottom) */}
          {cookingStage === 'none' && fishingPhase === 'idle' && !activeGather && zone !== 'sailing' ? (
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => setDockOpen((o) => !o)}
                className="pointer-events-auto mb-1.5 flex items-center gap-1 rounded-t-xl border border-b-0 border-teal-300/30 bg-[#072633]/90 px-3.5 py-1 text-[11px] font-bold text-cyan-200 hover:text-white cursor-pointer"
              >
                {dockOpen ? (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" /> 컨트롤 접기 (H)
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" /> 컨트롤 열기 (H)
                  </>
                )}
              </button>

              {dockOpen ? (
                <div className="pointer-events-auto flex max-w-[96vw] flex-wrap items-center justify-center gap-2 rounded-2xl border border-teal-300/35 bg-[#072633]/92 px-3 sm:px-4 py-2.5 sm:py-3 shadow-2xl">
                  {/* Map Zone Switcher */}
                  <div className="flex rounded-xl bg-slate-900/80 p-1">
                    <button
                      type="button"
                      onClick={() => handleZoneChange('fishing')}
                      className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                        zone === 'fishing'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Compass className="h-3.5 w-3.5" /> 외부 낚시터
                    </button>
                    <button
                      type="button"
                      onClick={() => handleZoneChange('kitchen')}
                      className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                        zone === 'kitchen'
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <UtensilsCrossed className="h-3.5 w-3.5" /> 내부 조리실
                    </button>
                  </div>

                  {/* Contextual Primary Actions */}
                  {zone === 'fishing' ? (
                    <>
                      <button
                        type="button"
                        onClick={startFishing}
                        className="flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-4 sm:px-5 py-2 text-sm font-black text-slate-950 shadow hover:from-cyan-300 hover:to-teal-300 active:scale-[0.98] cursor-pointer"
                      >
                        <Fish className="h-4 w-4" /> 낚싯대 던지기 (E)
                      </button>
                      <button
                        type="button"
                        onClick={() => launchBoat()}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-300/45 bg-cyan-500/20 px-3.5 py-2 text-xs font-extrabold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                      >
                        <Anchor className="h-4 w-4 text-cyan-300" /> 선착장 · 배 띄우기
                      </button>
                    </>
                  ) : zone === 'island' ? (
                    <>
                      {nearStation && nearStation.startsWith('gather_node:') ? (
                        <button
                          type="button"
                          onClick={() => openGatherByAction(nearStation)}
                          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2 text-sm font-black text-slate-950 shadow cursor-pointer"
                        >
                          <Sparkles className="h-4 w-4" /> 희귀 재료 채집하기 (E)
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => launchBoat('funafuti')}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-300/45 bg-cyan-500/20 px-4 py-2 text-xs font-extrabold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                      >
                        <Anchor className="h-4 w-4 text-cyan-300" /> 배 타고 돌아가기
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveModal('market')}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-400/20 px-4 py-2 text-xs font-extrabold text-amber-200 hover:bg-amber-400/30 cursor-pointer"
                      >
                        <ShoppingBag className="h-4 w-4" /> 식재료 상점
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveModal('prep')}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-sm font-black text-slate-950 shadow hover:from-amber-300 hover:to-orange-400 active:scale-[0.98] cursor-pointer"
                      >
                        <Swords className="h-4 w-4" /> 요리 대결 시작
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div />
          )}
        </div>
      ) : null}

      {/* Sailing HUD */}
      {screen === 'playing' && zone === 'sailing' && cookingStage === 'none' ? (
        <SailingHUD
          targetIsland={sailingTarget}
          distanceRemaining={sailingTelemetry.distance}
          etaSeconds={sailingTelemetry.etaSeconds}
          autoSail={autoSail}
          onSelectTarget={(id) => {
            setSailingTarget(id);
            worldRef.current?.setSailingTarget(id);
          }}
          onToggleAutoSail={() => {
            setAutoSail((prev) => {
              const next = !prev;
              worldRef.current?.setAutoSail(next);
              return next;
            });
          }}
          onReturnDock={() => {
            setAutoSail(false);
            worldRef.current?.disembarkAtIsland('funafuti');
            setCurrentIslandId('funafuti');
            setZone('fishing');
            showToast('푸나푸티 본섬 선착장으로 귀환했습니다.');
          }}
        />
      ) : null}

      {/* Outer Island Rare Ingredient Gathering Minigame HUD */}
      {screen === 'playing' && activeGather ? (
        <GatherMinigameHUD
          ingredient={activeGather.ingredient}
          islandNameKo={activeGather.islandNameKo}
          onHit={() => worldRef.current?.triggerGatherHitBurst(activeGather.ingredient.id)}
          onComplete={handleGatherComplete}
          onCancel={() => {
            worldRef.current?.setGatheringActive(false);
            setActiveGather(null);
          }}
        />
      ) : null}

      {/* Fishing Interactive HUD */}
      {screen === 'playing' && cookingStage === 'none' ? (
        <FishingHUD
          phase={fishingPhase}
          lastCaught={lastCaught}
          onCast={startFishing}
          onHookBite={handleHookBite}
          onReelComplete={handleReelComplete}
          onCloseCatch={handleCloseCatch}
        />
      ) : null}

      {/* 3-Stage Cooking Minigame HUD */}
      {battlePlan && (cookingStage === 'wash' || cookingStage === 'prep' || cookingStage === 'cook') ? (
        <CookingMinigameHUD
          stage={cookingStage}
          plan={battlePlan}
          scores={stageScores}
          onStageBurst={(station, col) => worldRef.current?.triggerKitchenBurst(station, col)}
          onHeatChange={(h) => worldRef.current?.setHeatLevel(h)}
          onStageComplete={handleStageComplete}
        />
      ) : null}

      {/* Judging & Verdict Overlay */}
      {battlePlan && (cookingStage === 'judging' || cookingStage === 'result') ? (
        <JudgingOverlay
          phase={cookingStage}
          plan={battlePlan}
          verdict={verdict}
          isSignedIn={Boolean(authUser)}
          rankPublished={rankPublishedThisBattle}
          publishingRank={publishingRank}
          onPublishRank={() => void handlePublishRank()}
          onSignInAndPublish={() => void handleSignInAndPublish()}
          onFinish={handleFinishBattle}
        />
      ) : null}

      {/* Dedicated Fish Encyclopedia Modal */}
      {activeModal === 'dex' ? (
        <FishDexModal
          caughtSpeciesIds={caughtSpeciesIds}
          dexRecords={fishDexRecords}
          onClose={() => setActiveModal('none')}
        />
      ) : null}

      {/* Ingredient Market Modal */}
      {activeModal === 'market' ? (
        <MarketModal
          coins={profile.coins}
          pantry={pantry}
          onBuy={handleBuyIngredient}
          onClose={() => setActiveModal('none')}
        />
      ) : null}

      {/* Battle Prep Modal */}
      {activeModal === 'prep' ? (
        <BattlePrepModal
          fishInventory={fishInventory}
          pantry={pantry}
          judge={TUVALU_JUDGES[judgeIdx]}
          rival={RIVAL_CHEFS[rivalIdx]}
          onStartBattle={handleStartBattle}
          onOpenMarket={() => setActiveModal('market')}
          onGoFishing={() => {
            setActiveModal('none');
            handleZoneChange('fishing');
          }}
          onClose={() => setActiveModal('none')}
        />
      ) : null}

      {/* Profile & Leaderboard Modal */}
      {activeModal === 'profile' ? (
        <ProfileRankModal
          profile={profile}
          isSignedIn={Boolean(authUser)}
          userEmail={authUser?.email ?? null}
          caughtSpeciesIds={caughtSpeciesIds}
          publishing={publishingRank}
          statusMessage={rankStatusMsg}
          onUpdateDisplayName={(n) => void handleUpdateDisplayName(n)}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          onPublishRank={() => void handlePublishRank()}
          onClose={() => setActiveModal('none')}
        />
      ) : null}

      {/* Tuvalu Cultural & Probability Guide Modal */}
      {activeModal === 'guide' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-teal-300/40 bg-[#082936] p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-extrabold text-white">
              투발루 (Tuvalu) 라군 안내
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-cyan-100">
              {TUVALU_TIPS[tipIndex]}
            </p>

            <div className="mt-4 rounded-2xl bg-[#0c3747] p-4">
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                물고기 등급별 낚시 확률
              </div>
              <div className="mt-2 grid grid-cols-5 gap-1.5 text-center text-xs font-bold">
                {(['common', 'uncommon', 'epic', 'legendary', 'mythic'] as const).map((t) => (
                  <div
                    key={t}
                    className={`rounded-xl border p-2 ${FISH_TIERS[t].bgClass} ${FISH_TIERS[t].borderClass} ${FISH_TIERS[t].textClass}`}
                  >
                    <div>{FISH_TIERS[t].labelKo}</div>
                    <div className="mt-0.5 tabular-nums">{Math.round(FISH_TIERS[t].probability * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-[#0c3747] p-4 text-xs leading-relaxed text-slate-200 space-y-1">
              <div>• <strong>자유 이동 &amp; 점프</strong>: WASD/방향키 또는 조이스틱으로 섬을 자유롭게 탐험하고 <strong>Space(스페이스)</strong>로 점프하세요.</div>
              <div>• <strong>외부 낚시터</strong>: 부두 끝에서 <strong>E 키</strong> 또는 버튼으로 낚시를 해 물고기와 돈을 얻습니다.</div>
              <div>• <strong>선착장 &amp; 배 항해</strong>: 동쪽 선착장에서 배를 띄워 약 30초 거리의 3개 외곽 섬에서 희귀 재료를 채집하세요!</div>
              <div>• <strong>내부 조리실 &amp; 요리 대결</strong>: 3단계 요리 후 완성된 요리와 라이벌 요리를 투발루 현지인이 심사합니다.</div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="min-h-[44px] rounded-xl bg-teal-400 px-5 py-2 text-sm font-extrabold text-slate-950 hover:bg-teal-300 cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameApp />
    </ErrorBoundary>
  );
}
