import { useEffect, useRef, useState } from 'react';

export default function WineBottleAnimation() {
  const containerRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const waveOffset = useRef(0);
  const animFrame = useRef(null);
  const [waveHeight, setWaveHeight] = useState(0.6);

  // Mouse parallax
  useEffect(() => {
    const handleMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setMousePos({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  // Gyroscope (mobile)
  useEffect(() => {
    const handleOrientation = (e) => {
      if (e.gamma !== null && e.beta !== null) {
        const x = (e.gamma + 45) / 90; // -45 to +45 → 0 to 1
        const y = (e.beta + 45) / 90;
        setMousePos({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  // Wave animation
  useEffect(() => {
    const animate = () => {
      waveOffset.current += 0.03;
      setWaveHeight((h) => h + (0.6 - h) * 0.01); // slowly settles
      animFrame.current = requestAnimationFrame(animate);
    };
    animFrame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame.current);
  }, []);

  const tiltX = (mousePos.x - 0.5) * 8;
  const tiltY = (mousePos.y - 0.5) * -5;
  const offset = waveOffset.current;

  // Wave path
  const w1 = `M0,${65 + Math.sin(offset) * 3 + tiltX * 0.5}
    C30,${60 + Math.sin(offset + 1) * 4},70,${70 + Math.cos(offset) * 4},100,${65 + Math.sin(offset + 2) * 3 - tiltX * 0.5}
    L100,100 L0,100 Z`;
  const w2 = `M0,${70 + Math.sin(offset + 0.5) * 2 + tiltX * 0.3}
    C25,${68 + Math.cos(offset + 1.5) * 3},75,${73 + Math.sin(offset + 0.3) * 3},100,${70 + Math.cos(offset + 1) * 2 - tiltX * 0.3}
    L100,100 L0,100 Z`;

  return (
    <div ref={containerRef} className="relative w-48 h-64 sm:w-56 sm:h-72 mx-auto select-none">
      <svg
        viewBox="0 0 100 140"
        className="w-full h-full drop-shadow-2xl transition-transform duration-300"
        style={{ transform: `perspective(500px) rotateY(${tiltX}deg) rotateX(${tiltY}deg)` }}
      >
        <defs>
          <clipPath id="bottleClip">
            {/* Bottle shape */}
            <path d="
              M38,0 L62,0 L62,15 Q62,20 65,25 L68,30 Q72,38 72,48 L72,120 Q72,130 62,130 L38,130 Q28,130 28,120 L28,48 Q28,38 32,30 L35,25 Q38,20 38,15 Z
            " />
          </clipPath>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
          </linearGradient>
          <linearGradient id="wineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b1538" />
            <stop offset="100%" stopColor="#5a0f25" />
          </linearGradient>
          <linearGradient id="wineGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6b1030" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4a0b20" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="bottleColor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a3a2a" />
            <stop offset="50%" stopColor="#0f2a1a" />
            <stop offset="100%" stopColor="#1a3a2a" />
          </linearGradient>
          <linearGradient id="labelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5f0e8" />
            <stop offset="100%" stopColor="#e8e0d5" />
          </linearGradient>
        </defs>

        {/* Bottle body */}
        <path
          d="M38,0 L62,0 L62,15 Q62,20 65,25 L68,30 Q72,38 72,48 L72,120 Q72,130 62,130 L38,130 Q28,130 28,120 L28,48 Q28,38 32,30 L35,25 Q38,20 38,15 Z"
          fill="url(#bottleColor)"
          stroke="#0a1a10"
          strokeWidth="0.5"
        />

        {/* Wine liquid with waves (clipped to bottle) */}
        <g clipPath="url(#bottleClip)">
          <svg x="28" y="0" width="44" height="130" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={w1} fill="url(#wineGrad)" opacity="0.9">
              <animate attributeName="d" dur="3s" repeatCount="indefinite" values={`${w1};${w1}`} />
            </path>
            <path d={w2} fill="url(#wineGrad2)" opacity="0.7" />
          </svg>
        </g>

        {/* Glass reflection */}
        <path
          d="M38,0 L62,0 L62,15 Q62,20 65,25 L68,30 Q72,38 72,48 L72,120 Q72,130 62,130 L38,130 Q28,130 28,120 L28,48 Q28,38 32,30 L35,25 Q38,20 38,15 Z"
          fill="url(#glassGrad)"
        />

        {/* Highlight streak */}
        <path
          d="M33,50 Q32,75 34,110"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Label */}
        <rect x="32" y="75" width="36" height="30" rx="2" fill="url(#labelGrad)" stroke="#c8b89a" strokeWidth="0.5" />
        <line x1="36" y1="82" x2="64" y2="82" stroke="#7a1c3b" strokeWidth="0.3" />
        <text x="50" y="88" textAnchor="middle" fontSize="4" fontWeight="bold" fill="#7a1c3b" fontFamily="serif">V&amp;C</text>
        <text x="50" y="94" textAnchor="middle" fontSize="2.5" fill="#666" fontFamily="serif">Nicolas Froment</text>
        <text x="50" y="99" textAnchor="middle" fontSize="2" fill="#999" fontFamily="serif">Angers</text>
        <line x1="36" y1="101" x2="64" y2="101" stroke="#7a1c3b" strokeWidth="0.3" />

        {/* Cap / foil */}
        <rect x="40" y="-2" width="20" height="5" rx="1" fill="#8b6e4e" />
        <rect x="39" y="3" width="22" height="2" rx="0.5" fill="#a0845e" />
      </svg>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-wine-300/30 animate-float"
            style={{
              left: `${20 + i * 15}%`,
              top: `${60 + (i % 3) * 10}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${3 + i * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
