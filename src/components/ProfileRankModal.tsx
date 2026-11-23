import React, { useEffect, useState } from 'react';
import { Award, BookOpen, LogIn, LogOut, Trophy, UserCheck, X } from 'lucide-react';
import { FISH_CATALOG, FISH_TIERS, getChefTitleForWins } from '../data/tuvaluData';
import { fetchLeaderboard } from '../services/firebase';
import { LeaderboardEntryData, UserProfileData } from '../types/game';

interface ProfileRankModalProps {
  profile: UserProfileData;
  isSignedIn: boolean;
  userEmail: string | null;
  caughtSpeciesIds: string[];
  publishing: boolean;
  statusMessage: string | null;
  onUpdateDisplayName: (name: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onPublishRank: () => void;
  onClose: () => void;
}

export const ProfileRankModal: React.FC<ProfileRankModalProps> = ({
  profile,
  isSignedIn,
  userEmail,
  caughtSpeciesIds,
  publishing,
  statusMessage,
  onUpdateDisplayName,
  onSignIn,
  onSignOut,
  onPublishRank,
  onClose,
}) => {
  const [tab, setTab] = useState<'profile' | 'rank' | 'dex'>('profile');
  const [nameInput, setNameInput] = useState(profile.displayName);
  const [entries, setEntries] = useState<LeaderboardEntryData[]>([]);
  const [loadingRank, setLoadingRank] = useState(false);

  useEffect(() => {
    setNameInput(profile.displayName);
  }, [profile.displayName]);

  const loadRank = async () => {
    setLoadingRank(true);
    try {
      const list = await fetchLeaderboard();
      setEntries(list);
    } finally {
      setLoadingRank(false);
    }
  };

  useEffect(() => {
    if (tab === 'rank') {
      void loadRank();
    }
  }, [tab]);

  const chefTitle = getChefTitleForWins(profile.wins);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-3xl border border-teal-300/35 bg-[#082936] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/20 text-teal-300">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-white">
                개인정보 · 투발루 랭킹 · 어류 도감
              </h2>
              <p className="text-xs text-cyan-200/80">{chefTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 px-6 py-3">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer ${
              tab === 'profile' ? 'bg-teal-400 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <UserCheck className="h-4 w-4" /> 내 개인정보 &amp; 승리 수
          </button>
          <button
            type="button"
            onClick={() => setTab('rank')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer ${
              tab === 'rank' ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <Trophy className="h-4 w-4" /> 투발루 셰프 랭킹
          </button>
          <button
            type="button"
            onClick={() => setTab('dex')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer ${
              tab === 'dex' ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <BookOpen className="h-4 w-4" /> 라군 어류 도감 ({caughtSpeciesIds.length}/15)
          </button>
        </div>

        {/* Content */}
        <div className="tuvalu-scroll overflow-y-auto p-6">
          {tab === 'profile' ? (
            <div className="space-y-5">
              {/* Auth Card */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c3747] p-4">
                <div>
                  <div className="text-xs font-bold text-teal-300">
                    {isSignedIn ? 'Google 계정 연동됨 (클라우드 개인정보 저장)' : '게스트 플레이 중'}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-white">
                    {isSignedIn ? userEmail ?? profile.displayName : '로그인하면 승리 수가 개인정보에 저장되고 랭킹에 올릴 수 있습니다.'}
                  </div>
                </div>
                {isSignedIn ? (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" /> 로그아웃
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-300 cursor-pointer"
                  >
                    <LogIn className="h-4 w-4" /> Google 로그인
                  </button>
                )}
              </div>

              {/* Nickname Editor */}
              <div className="rounded-2xl border border-white/10 bg-[#0c3747] p-4">
                <label className="block text-xs font-bold text-cyan-200">셰프 닉네임</label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    maxLength={32}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="flex-1 rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-teal-400 focus:outline-none"
                    placeholder="닉네임 입력"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateDisplayName(nameInput)}
                    className="rounded-xl bg-teal-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-teal-300 cursor-pointer"
                  >
                    저장
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-amber-400/30 bg-[#0c3747] p-4">
                  <div className="text-xs text-slate-300">요리 대결 승리</div>
                  <div className="mt-1 text-2xl font-black tabular-nums text-amber-300">{profile.wins}승</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0c3747] p-4">
                  <div className="text-xs text-slate-300">총 대결</div>
                  <div className="mt-1 text-2xl font-black tabular-nums text-white">{profile.totalBattles}전</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0c3747] p-4">
                  <div className="text-xs text-slate-300">최고 요리 점수</div>
                  <div className="mt-1 text-2xl font-black tabular-nums text-teal-300">{profile.bestDishScore}점</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0c3747] p-4">
                  <div className="text-xs text-slate-300">누적 포획 어류</div>
                  <div className="mt-1 text-2xl font-black tabular-nums text-cyan-300">{profile.fishCaughtCount}마리</div>
                </div>
              </div>

              {/* Publish Wins Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-400/35 bg-[#093242] p-4">
                <div>
                  <div className="text-sm font-extrabold text-white">내 승리 수를 랭킹에 올리기</div>
                  <div className="text-xs text-slate-300">
                    저장된 개인 승리 수({profile.wins}승)를 공개 투발루 셰프 리더보드에 등록합니다.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={publishing}
                  onClick={isSignedIn ? onPublishRank : onSignIn}
                  className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-amber-300 hover:to-orange-300 cursor-pointer"
                >
                  {publishing
                    ? '등록 중...'
                    : isSignedIn
                    ? '랭킹에 승리 수 올리기'
                    : '로그인 후 랭킹 등록'}
                </button>
              </div>

              {statusMessage ? (
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200">
                  {statusMessage}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'rank' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">
                  승리 수 기준으로 정렬된 투발루 최고 셰프 순위입니다.
                </p>
                <button
                  type="button"
                  onClick={() => void loadRank()}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-slate-700 cursor-pointer"
                >
                  새로고침
                </button>
              </div>

              {loadingRank ? (
                <div className="py-10 text-center text-sm text-slate-300">랭킹 불러오는 중...</div>
              ) : entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-300">
                  아직 등록된 랭킹이 없습니다. 첫 번째 투발루 셰프가 되어보세요!
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry, idx) => (
                    <div
                      key={entry.uid}
                      className={`flex items-center justify-between rounded-2xl border p-3.5 ${
                        entry.uid === profile.uid
                          ? 'border-amber-300/60 bg-amber-400/15'
                          : 'border-white/10 bg-[#0c3747]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black tabular-nums ${
                            idx === 0
                              ? 'bg-amber-400 text-slate-950'
                              : idx === 1
                              ? 'bg-slate-200 text-slate-950'
                              : idx === 2
                              ? 'bg-orange-400 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="text-sm font-extrabold text-white">{entry.displayName}</div>
                          <div className="text-[11px] text-teal-300">{entry.chefTitle}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="text-xs text-slate-300">최고 점수</div>
                          <div className="text-xs font-bold tabular-nums text-cyan-200">{entry.bestDishScore}점</div>
                        </div>
                        <div>
                          <div className="text-lg font-black tabular-nums text-amber-300">{entry.wins}승</div>
                          <div className="text-[11px] tabular-nums text-slate-400">{entry.totalBattles}전</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'dex' ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#0c3747] p-3 text-xs text-cyan-100">
                등급별 출현 확률: 일반(30%) · 드문(30%) · 에픽(25%) · 전설(10%) · 신화(5%)
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {FISH_CATALOG.map((sp) => {
                  const tier = FISH_TIERS[sp.tier];
                  const caught = caughtSpeciesIds.includes(sp.id);
                  return (
                    <div
                      key={sp.id}
                      className={`rounded-2xl border p-3.5 ${
                        caught ? 'border-white/15 bg-[#0c3747]' : 'border-white/5 bg-slate-900/50 opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-extrabold ${tier.bgClass} ${tier.textClass}`}
                        >
                          {tier.labelKo} ({Math.round(tier.probability * 100)}%)
                        </span>
                        <span className="text-xs font-bold text-amber-300">
                          {caught ? '포획 완료' : '미발견'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-teal-300" />
                        <span className="text-sm font-extrabold text-white">
                          {caught ? sp.nameKo : '???'}
                        </span>
                        <span className="text-xs text-slate-400">({sp.nameTuvalu})</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        {caught ? sp.tuvaluFact : '푸나푸티 라군에서 낚시를 통해 발견하세요.'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
