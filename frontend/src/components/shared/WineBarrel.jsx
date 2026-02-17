import { useId } from 'react';

/**
 * WineBarrel — Barrique SVG animée avec vin qui ondule ("Part des anges")
 * @param {number} amount - Montant accumulé (affiché)
 * @param {string} label - Label affiché sous le montant
 * @param {number} fillPct - Niveau de remplissage 0-100
 * @param {string} color - Couleur du vin (default: wine-700)
 * @param {string} className - Classes CSS additionnelles
 */
export default function WineBarrel({ amount = 0, label = '', fillPct = 50, color = '#722F37', className = '' }) {
  const id = useId().replace(/:/g, '');
  const clampedFill = Math.max(5, Math.min(95, fillPct));
  // SVG viewBox is 0 0 120 140. Barrel body spans ~y:20 to y:120
  const bodyTop = 20;
  const bodyBottom = 120;
  const bodyHeight = bodyBottom - bodyTop;
  const fillY = bodyBottom - (clampedFill / 100) * bodyHeight;
  const lightColor = color + '99';

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg viewBox="0 0 120 140" className="w-full max-w-[120px]" aria-hidden="true">
        <defs>
          <clipPath id={`barrel-clip-${id}`}>
            {/* Barrel body — bulging shape */}
            <path d="M25,25 C20,25 15,40 13,70 C15,100 20,115 25,115 L95,115 C100,115 105,100 107,70 C105,40 100,25 95,25 Z" />
          </clipPath>
        </defs>

        {/* Barrel body background (empty state) */}
        <path d="M25,25 C20,25 15,40 13,70 C15,100 20,115 25,115 L95,115 C100,115 105,100 107,70 C105,40 100,25 95,25 Z" fill="#f3f0f1" />

        {/* Wine fill (clipped inside barrel) */}
        <g clipPath={`url(#barrel-clip-${id})`}>
          <rect x="0" y={fillY} width="120" height={140 - fillY} fill={color} />
          {/* Animated wave surface */}
          <g className={`barrel-wave-${id}`}>
            <path
              d={`M-40,${fillY} C-20,${fillY - 3} 0,${fillY + 3} 20,${fillY} C40,${fillY - 3} 60,${fillY + 3} 80,${fillY} C100,${fillY - 3} 120,${fillY + 3} 140,${fillY} C160,${fillY - 3} 180,${fillY + 3} 200,${fillY} L200,140 L-40,140 Z`}
              fill={lightColor}
            />
          </g>
        </g>

        {/* Barrel outline */}
        <path d="M25,25 C20,25 15,40 13,70 C15,100 20,115 25,115 L95,115 C100,115 105,100 107,70 C105,40 100,25 95,25 Z" fill="none" stroke="#9ca3af" strokeWidth="1.5" opacity="0.5" />

        {/* Barrel hoops (metal bands) */}
        <path d="M18,38 C16,38 14,45 13.5,50 C14,55 16,55 18,55" fill="none" stroke="#8b7355" strokeWidth="2.5" opacity="0.6" />
        <path d="M102,38 C104,38 106,45 106.5,50 C106,55 104,55 102,55" fill="none" stroke="#8b7355" strokeWidth="2.5" opacity="0.6" />
        <ellipse cx="60" cy="40" rx="47" ry="3" fill="none" stroke="#8b7355" strokeWidth="2" opacity="0.6" />
        <ellipse cx="60" cy="100" rx="47" ry="3" fill="none" stroke="#8b7355" strokeWidth="2" opacity="0.6" />
        <ellipse cx="60" cy="70" rx="48" ry="3" fill="none" stroke="#8b7355" strokeWidth="1.5" opacity="0.4" />

        {/* Top ellipse (barrel opening) */}
        <ellipse cx="60" cy="25" rx="35" ry="8" fill="#e8e0d8" stroke="#9ca3af" strokeWidth="1" />

        {/* Bottom ellipse */}
        <ellipse cx="60" cy="115" rx="35" ry="8" fill="none" stroke="#9ca3af" strokeWidth="1" opacity="0.3" />

        {/* Bung hole (spigot) */}
        <circle cx="60" cy="70" r="5" fill="#6b5b4f" stroke="#4a3f35" strokeWidth="1" />
        <circle cx="60" cy="70" r="2" fill="#4a3f35" />

        {/* Wood grain lines */}
        <line x1="35" y1="28" x2="33" y2="112" stroke="#d4c4a8" strokeWidth="0.5" opacity="0.4" />
        <line x1="60" y1="25" x2="60" y2="115" stroke="#d4c4a8" strokeWidth="0.5" opacity="0.4" />
        <line x1="85" y1="28" x2="87" y2="112" stroke="#d4c4a8" strokeWidth="0.5" opacity="0.4" />
      </svg>

      {/* Amount + label */}
      <p className="text-lg font-bold text-gray-800 mt-1">
        {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)}
      </p>
      {label && <p className="text-xs text-gray-500 text-center">{label}</p>}

      {/* Wave animation CSS */}
      <style>{`
        .barrel-wave-${id} {
          animation: barrelWave-${id} 3s ease-in-out infinite;
        }
        @keyframes barrelWave-${id} {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(-20px); }
        }
      `}</style>
    </div>
  );
}
