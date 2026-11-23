import React from 'react';
import { FishSpecies } from '../types/game';

interface DishIllustrationSVGProps {
  fishSpecies: FishSpecies;
  ingredientIds: string[];
  perfection: number;
  size?: 'md' | 'lg';
}

function toHex(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`;
}

export const DishIllustrationSVG: React.FC<DishIllustrationSVGProps> = ({
  fishSpecies,
  ingredientIds,
  perfection,
  size = 'lg',
}) => {
  const fishMain = toHex(fishSpecies.primaryColor);
  const fishBelly = toHex(fishSpecies.secondaryColor);
  const fishFin = toHex(fishSpecies.finColor);
  const dims = size === 'lg' ? 'h-40 w-56' : 'h-32 w-44';

  const has = (id: string) => ingredientIds.includes(id);

  return (
    <svg viewBox="0 0 240 170" className={`${dims} select-none`} aria-hidden="true">
      <defs>
        <radialGradient id="plateRim" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="82%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>
        <linearGradient id="bananaLeaf" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>

      {/* Pandanus Woven Table Mat */}
      <ellipse cx="120" cy="96" rx="108" ry="62" fill="#926c3a" opacity="0.55" />

      {/* Ceramic Tuvalu Platter */}
      <ellipse cx="120" cy="92" rx="96" ry="54" fill="url(#plateRim)" stroke="#0d9488" strokeWidth="3" />
      <ellipse cx="120" cy="92" rx="78" ry="42" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />

      {/* Banana Leaf Underlay */}
      <path
        d="M48 92C68 58 172 58 192 92C172 126 68 126 48 92Z"
        fill="url(#bananaLeaf)"
        opacity="0.88"
      />
      <path d="M54 92H186" stroke="#86efac" strokeWidth="1.5" opacity="0.6" />

      {/* === SAUCE / LOLO BASE LAYERS === */}
      {has('lolo_coconut') ? (
        <path
          d="M66 95C88 74 152 74 176 96C154 118 88 118 66 95Z"
          fill="#fef9c3"
          opacity="0.82"
        />
      ) : null}

      {has('sacred_lolo') ? (
        <g>
          <ellipse cx="120" cy="94" rx="64" ry="26" fill="#fef08a" opacity="0.85" />
          <path
            d="M72 94C90 80 150 80 168 94"
            stroke="#fffbeb"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      ) : null}

      {has('turmeric_chili') ? (
        <ellipse cx="120" cy="95" rx="58" ry="22" fill="#f59e0b" opacity="0.45" />
      ) : null}

      {/* === SIDE VEGETABLES & MEAT UNDER/AROUND FISH === */}
      {has('pulaka_taro') ? (
        <g>
          <ellipse cx="70" cy="74" rx="14" ry="9" fill="#c4b5fd" stroke="#7c3aed" strokeWidth="1.5" />
          <ellipse cx="84" cy="68" rx="12" ry="8" fill="#ddd6fe" stroke="#7c3aed" strokeWidth="1.5" />
        </g>
      ) : null}

      {has('ancient_pulaka') ? (
        <g>
          <ellipse cx="70" cy="74" rx="15" ry="9" fill="#e9d5ff" stroke="#facc15" strokeWidth="2" />
          <ellipse cx="86" cy="67" rx="13" ry="8" fill="#fef08a" stroke="#a855f7" strokeWidth="1.8" />
        </g>
      ) : null}

      {has('breadfruit_ulu') ? (
        <g>
          <path d="M150 64L172 68L164 80Z" fill="#d9f99d" stroke="#65a30d" strokeWidth="1.5" />
          <path d="M162 72L182 78L170 88Z" fill="#ecfccb" stroke="#65a30d" strokeWidth="1.5" />
        </g>
      ) : null}

      {has('seaweed_shallot') ? (
        <g>
          <path
            d="M62 110C68 102 76 114 82 106C88 98 96 112 102 104"
            stroke="#10b981"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="80" cy="112" r="5" fill="none" stroke="#c084fc" strokeWidth="2.2" />
          <circle cx="92" cy="114" r="4.5" fill="none" stroke="#e879f9" strokeWidth="2" />
        </g>
      ) : null}

      {has('deep_sea_grapes') ? (
        <g>
          {[
            [64, 108],
            [70, 113],
            [76, 107],
            [82, 114],
            [88, 108],
            [94, 113],
          ].map(([gx, gy], i) => (
            <circle key={i} cx={gx} cy={gy} r="4.2" fill="#2dd4bf" stroke="#0f766e" strokeWidth="1" />
          ))}
        </g>
      ) : null}

      {has('island_pork') ? (
        <g>
          <rect x="148" y="98" width="24" height="12" rx="5" fill="#fb7185" stroke="#881337" strokeWidth="1.5" />
          <rect x="158" y="106" width="22" height="11" rx="5" fill="#f43f5e" stroke="#881337" strokeWidth="1.5" />
          <line x1="154" y1="100" x2="158" y2="108" stroke="#450a0a" strokeWidth="1.5" />
          <line x1="164" y1="100" x2="168" y2="108" stroke="#450a0a" strokeWidth="1.5" />
        </g>
      ) : null}

      {has('smoked_chicken') ? (
        <g transform="translate(154, 102) rotate(-15)">
          <ellipse cx="10" cy="7" rx="11" ry="7" fill="#d97706" stroke="#78350f" strokeWidth="1.5" />
          <rect x="19" y="5" width="9" height="4" rx="2" fill="#fef3c7" />
        </g>
      ) : null}

      {has('coconut_crab') ? (
        <g>
          <path d="M156 105C168 95 182 104 176 116C166 118 158 112 156 105Z" fill="#f97316" stroke="#9a3412" strokeWidth="1.5" />
          <circle cx="174" cy="109" r="3" fill="#fed7aa" />
        </g>
      ) : null}

      {has('royal_crab_claw') ? (
        <g>
          <path d="M150 104C166 90 186 98 182 115C170 120 156 114 150 104Z" fill="#ea580c" stroke="#fef08a" strokeWidth="2" />
          <path d="M174 102L186 96L180 110Z" fill="#fb923c" />
        </g>
      ) : null}

      {/* === CENTERPIECE COOKED FISH === */}
      <g>
        {/* Tail */}
        <path d="M154 90L178 74V106L154 90Z" fill={fishFin} />
        {/* Dorsal Fin */}
        <path d="M100 72L118 54L134 72Z" fill={fishFin} />
        {/* Main Body */}
        <ellipse cx="118" cy="90" rx="42" ry="18" fill={fishMain} stroke="#0f172a" strokeWidth="1.5" />
        {/* Belly */}
        <path d="M80 94C96 108 140 108 156 94C138 100 98 100 80 94Z" fill={fishBelly} opacity="0.88" />
        {/* Swordbill if Sailfish/Marlin */}
        {fishSpecies.id.includes('sailfish') || fishSpecies.id.includes('marlin') ? (
          <path d="M77 88L54 90L77 92Z" fill="#fef08a" />
        ) : null}
        {/* Culinary Grill Marks */}
        <path d="M100 78L108 100M116 76L124 102M132 78L138 99" stroke="#451a03" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
        {/* Eye */}
        <circle cx="92" cy="86" r="4" fill="#ffffff" />
        <circle cx="91" cy="86" r="2" fill="#0f172a" />
      </g>

      {/* === TOPPINGS: SALTS, CHILI, LIME, HERBS === */}
      {has('lime_ginger') ? (
        <g>
          <path d="M58 84A12 12 0 0 1 78 84Z" fill="#84cc16" stroke="#ecfccb" strokeWidth="2" />
          <path d="M63 83L68 77M68 83L73 78" stroke="#ecfccb" strokeWidth="1.2" />
          <rect x="128" y="82" width="12" height="2.5" rx="1" fill="#fde047" transform="rotate(20 128 82)" />
          <rect x="135" y="87" width="11" height="2.5" rx="1" fill="#fde047" transform="rotate(-15 135 87)" />
        </g>
      ) : null}

      {has('turmeric_chili') ? (
        <g>
          <circle cx="110" cy="88" r="3.8" fill="none" stroke="#ef4444" strokeWidth="2.2" />
          <circle cx="126" cy="93" r="3.5" fill="none" stroke="#dc2626" strokeWidth="2.2" />
        </g>
      ) : null}

      {has('golden_noni_chili') ? (
        <g>
          <circle cx="106" cy="85" r="4.5" fill="#fbbf24" stroke="#f43f5e" strokeWidth="2" />
          <circle cx="123" cy="91" r="4.5" fill="#f43f5e" stroke="#fef08a" strokeWidth="1.8" />
          <circle cx="136" cy="84" r="3.8" fill="#fbbf24" stroke="#e11d48" strokeWidth="1.6" />
        </g>
      ) : null}

      {has('funafuti_seasalt') ? (
        <g fill="#ffffff" stroke="#94a3b8" strokeWidth="0.6">
          <rect x="104" y="82" width="4" height="4" transform="rotate(25 104 82)" />
          <rect x="118" y="89" width="4" height="4" transform="rotate(10 118 89)" />
          <rect x="132" y="84" width="3.5" height="3.5" transform="rotate(40 132 84)" />
          <rect x="112" y="95" width="3.5" height="3.5" transform="rotate(15 112 95)" />
        </g>
      ) : null}

      {has('smoked_coralsalt') ? (
        <g fill="#fda4af" stroke="#f43f5e" strokeWidth="0.7">
          <polygon points="106,82 110,85 106,88 102,85" />
          <polygon points="122,87 126,90 122,93 118,90" />
          <polygon points="134,83 138,86 134,89 130,86" />
        </g>
      ) : null}

      {has('nanumea_amber_salt') ? (
        <g fill="#fbbf24" stroke="#fffbeb" strokeWidth="0.9">
          <polygon points="104,80 109,85 104,90 99,85" />
          <polygon points="120,86 125,91 120,96 115,91" />
          <polygon points="135,81 140,86 135,91 130,86" />
        </g>
      ) : null}

      {/* Aromatic Steam & Quality Sparkles for High Perfection */}
      {perfection >= 65 ? (
        <g stroke="#fef08a" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85">
          <path d="M90 48C86 38 94 30 90 20" />
          <path d="M120 44C116 34 124 26 120 16" />
          <path d="M148 48C144 38 152 30 148 20" />
        </g>
      ) : null}
    </svg>
  );
};
