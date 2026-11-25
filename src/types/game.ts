export type FishTier = 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';

export type FlavorTag = 'umami' | 'rich' | 'spicy' | 'fresh' | 'savory';

export type IngredientCategory = 'meat' | 'vegetable' | 'salt' | 'spice';

export type IslandId = 'funafuti' | 'nanumea' | 'nukufetau' | 'niutao';

export type MapZone = 'fishing' | 'kitchen' | 'sailing' | 'island';

export type GameScreen = 'title' | 'playing';

export type FishingPhase = 'idle' | 'casting' | 'waiting' | 'biting' | 'reeling' | 'caught';

export type CookingStage =
  | 'none'
  | 'intro'
  | 'wash'
  | 'prep'
  | 'cook'
  | 'waiting_opponent'
  | 'judging'
  | 'result';

export interface TierMeta {
  id: FishTier;
  labelKo: string;
  labelEn: string;
  probability: number; // 0.30, 0.30, 0.25, 0.10, 0.05
  colorHex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  coinReward: number;
  dishQualityBonus: number;
  reelDifficulty: number;
}

export interface FishingDifficultySpec {
  tier: FishTier;
  biteWindowMs: number;
  startProgress: number;
  zoneHalfWidth: number;
  zoneSpeedMin: number;
  zoneSpeedMax: number;
  directionFlipChance: number;
  surgeIntervalSec: number;
  surgeSpeedMult: number;
  gainPerSec: number;
  drainPerSec: number;
  riseAccel: number;
  fallAccel: number;
  maxVel: number;
  drag: number;
  difficultyLabelKo: string;
  stars: number;
  biteHintKo: string;
}

export interface FishSpecies {
  id: string;
  nameKo: string;
  nameTuvalu: string;
  tier: FishTier;
  primaryColor: number;
  secondaryColor: number;
  finColor: number;
  scaleFactor: number;
  bodyLength: number;
  bodyDepth: number;
  flavorTags: FlavorTag[];
  tuvaluFact: string;
}

export interface CaughtFish {
  uid: string;
  speciesId: string;
  weightKg: number;
  caughtAt: number;
}

export interface IngredientItem {
  id: string;
  nameKo: string;
  nameTuvalu: string;
  category: IngredientCategory;
  price: number;
  flavorTags: FlavorTag[];
  palateBonus: number;
  colorHex: string;
  description: string;
  isRare?: boolean;
  islandId?: Exclude<IslandId, 'funafuti'>;
}

export interface OuterIslandMeta {
  id: Exclude<IslandId, 'funafuti'>;
  nameKo: string;
  nameTuvalu: string;
  subtitleKo: string;
  descriptionKo: string;
  position: { x: number; z: number };
  themeColor: number;
  floraColor: number;
  rareIngredientIds: string[];
}

export interface TuvaluJudge {
  id: string;
  nameKo: string;
  roleKo: string;
  avatarColor: number;
  crownColor: number;
  preferredFlavors: FlavorTag[];
  preferredTierMin: FishTier;
  palatePromptKo: string;
  tuvaluIntroKo: string;
}

export interface RivalChef {
  id: string;
  nameKo: string;
  titleKo: string;
  outfitColor: number;
  baseSkill: number;
  palateAffinity: number;
  specialtyDishKo: string;
  specialtyFishId: string;
  specialtyIngredientIds: string[];
  specialtyDescriptionKo: string;
}

export interface BattlePlan {
  fish: CaughtFish;
  fishSpecies: FishSpecies;
  ingredientIds: string[];
  judge: TuvaluJudge;
  rival: RivalChef;
}

export interface CookingStageScores {
  wash: number; // 0 - 100
  prep: number; // 0 - 100
  cook: number; // 0 - 100
}

export interface BattleVerdict {
  playerPerfection: number; // 0 - 100
  playerPalateMatch: number; // 0 - 100
  playerTotal: number; // 0 - 200
  rivalPerfection: number;
  rivalPalateMatch: number;
  rivalTotal: number;
  won: boolean;
  isDraw: boolean;
  rewardCoins: number;
  judgeCommentKo: string;
  dishNameKo: string;
}

export interface UserProfileData {
  uid: string;
  displayName: string;
  wins: number;
  losses: number;
  totalBattles: number;
  coins: number;
  fishCaughtCount: number;
  bestDishScore: number;
  rarestFishTier: FishTier | 'none';
}

export interface LeaderboardEntryData {
  uid: string;
  displayName: string;
  chefTitle: string;
  wins: number;
  totalBattles: number;
  bestDishScore: number;
  rarestFishTier: FishTier | 'none';
  isPublic: boolean;
}

export type RealtimeRoomStatus = 'waiting' | 'prep' | 'playing' | 'finished' | 'cancelled';

export type RealtimePlayerStage = 'idle' | 'intro' | 'wash' | 'prep' | 'cook' | 'done';

export interface BattlePlayerSlot {
  uid: string;
  displayName: string;
  chefTitle: string;
  wins: number;
  losses: number;
  bestDishScore: number;
  rarestFishTier: FishTier | 'none';
  ready: boolean;
  fishSpeciesId: string;
  fishWeightKg: number;
  ingredientIds: string[];
  stage: RealtimePlayerStage;
  washScore: number;
  prepScore: number;
  cookScore: number;
  perfectionScore: number;
  palateScore: number;
  totalScore: number;
  dishNameKo: string;
}

export interface BattleRoomData {
  roomId: string;
  status: RealtimeRoomStatus;
  isMatchmaking: boolean;
  judgeId: string;
  hostUid: string;
  guestUid: string;
  host: BattlePlayerSlot;
  guest: BattlePlayerSlot;
  winnerUid: string;
  createdAtMs: number;
  startedAtMs: number;
  updatedAtMs: number;
}
