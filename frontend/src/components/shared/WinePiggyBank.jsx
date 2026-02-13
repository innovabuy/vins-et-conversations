import { useId } from 'react';

/**
 * WinePiggyBank — Cochon tirelire SVG animé avec vin qui ondule
 * @param {number} amount - Montant accumulé (affiché)
 * @param {string} label - Label affiché sous le montant
 * @param {number} fillPct - Niveau de remplissage 0-100
 * @param {string} color - Couleur du vin (default: wine-700)
 * @param {string} className - Classes CSS additionnelles
 */
export default function WinePiggyBank({ amount = 0, label = '', fillPct = 50, color = '#722F37', className = '' }) {
  const id = useId().replace(/:/g, '');
  const clampedFill = Math.max(5, Math.min(95, fillPct));
  // SVG viewBox is 0 0 160 130. Piggy body spans ~y:20 to y:105
  // Fill level maps fillPct to y position (inverted: 0% = bottom, 100% = top)
  const fillY = 105 - (clampedFill / 100) * 85;
  const lightColor = color + '99'; // semi-transparent for wave

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg viewBox="0 0 160 130" className="w-full max-w-[120px]" aria-hidden="true">
        <defs>
          <clipPath id={`piggy-clip-${id}`}>
            {/* Piggy bank body silhouette */}
            <ellipse cx="80" cy="65" rx="48" ry="35" />
            {/* Head */}
            <circle cx="38" cy="48" r="20" />
            {/* Snout */}
            <ellipse cx="22" cy="54" rx="10" ry="7" />
            {/* Ears */}
            <ellipse cx="32" cy="28" rx="8" ry="12" />
            {/* Legs */}
            <rect x="50" y="92" width="10" height="16" rx="3" />
            <rect x="65" y="94" width="10" height="14" rx="3" />
            <rect x="92" y="94" width="10" height="14" rx="3" />
            <rect x="107" y="92" width="10" height="16" rx="3" />
            {/* Tail */}
            <circle cx="130" cy="55" r="6" />
          </clipPath>
        </defs>

        {/* Piggy background (empty state) */}
        <g>
          <ellipse cx="80" cy="65" rx="48" ry="35" fill="#f3f0f1" />
          <circle cx="38" cy="48" r="20" fill="#f3f0f1" />
          <ellipse cx="22" cy="54" rx="10" ry="7" fill="#f3f0f1" />
          <ellipse cx="32" cy="28" rx="8" ry="12" fill="#f3f0f1" />
          <rect x="50" y="92" width="10" height="16" rx="3" fill="#f3f0f1" />
          <rect x="65" y="94" width="10" height="14" rx="3" fill="#f3f0f1" />
          <rect x="92" y="94" width="10" height="14" rx="3" fill="#f3f0f1" />
          <rect x="107" y="92" width="10" height="16" rx="3" fill="#f3f0f1" />
          <circle cx="130" cy="55" r="6" fill="#f3f0f1" />
        </g>

        {/* Wine fill (clipped inside piggy) */}
        <g clipPath={`url(#piggy-clip-${id})`}>
          {/* Static fill */}
          <rect x="0" y={fillY} width="160" height={130 - fillY} fill={color} />
          {/* Animated wave surface */}
          <g className="wine-wave-group">
            <path
              d={`M-40,${fillY} C-20,${fillY - 4} 0,${fillY + 4} 20,${fillY} C40,${fillY - 4} 60,${fillY + 4} 80,${fillY} C100,${fillY - 4} 120,${fillY + 4} 140,${fillY} C160,${fillY - 4} 180,${fillY + 4} 200,${fillY} L200,130 L-40,130 Z`}
              fill={lightColor}
            />
          </g>
        </g>

        {/* Piggy outline */}
        <g fill="none" stroke="#9ca3af" strokeWidth="1.5" opacity="0.5">
          <ellipse cx="80" cy="65" rx="48" ry="35" />
          <circle cx="38" cy="48" r="20" />
          <ellipse cx="22" cy="54" rx="10" ry="7" />
          <ellipse cx="32" cy="28" rx="8" ry="12" />
          <rect x="50" y="92" width="10" height="16" rx="3" />
          <rect x="65" y="94" width="10" height="14" rx="3" />
          <rect x="92" y="94" width="10" height="14" rx="3" />
          <rect x="107" y="92" width="10" height="16" rx="3" />
          <circle cx="130" cy="55" r="6" />
        </g>

        {/* Details: eye, snout nostrils, coin slot */}
        <circle cx="35" cy="44" r="3" fill="#4b5563" />
        <circle cx="36" cy="43" r="1" fill="white" />
        <ellipse cx="19" cy="53" rx="2" ry="1.5" fill="#9ca3af" />
        <ellipse cx="25" cy="53" rx="2" ry="1.5" fill="#9ca3af" />
        {/* Coin slot on top */}
        <rect x="72" y="27" width="16" height="3" rx="1.5" fill="#6b7280" />
      </svg>

      {/* Amount + label */}
      <p className="text-lg font-bold text-gray-800 mt-1">
        {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)}
      </p>
      {label && <p className="text-xs text-gray-500 text-center">{label}</p>}

      {/* Wave animation CSS */}
      <style>{`
        .wine-wave-group {
          animation: wineWave-${id} 3s ease-in-out infinite;
        }
        @keyframes wineWave-${id} {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(-20px); }
        }
      `}</style>
    </div>
  );
}
