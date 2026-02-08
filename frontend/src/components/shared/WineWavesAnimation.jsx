import { useEffect, useRef, useState, useCallback } from 'react';

const WAVE_COLORS = [
  { color: '#e04d74', opacity: 0.3 },  // wave 3 (back)
  { color: '#cc2d5a', opacity: 0.5 },  // wave 2 (middle)
  { color: '#ab2049', opacity: 0.8 },  // wave 1 (front)
];

const WAVE_DURATIONS = [16, 12, 8]; // seconds (back to front)

function buildWavePath(width, amplitude, phase, yBase) {
  const points = 7;
  const step = width / (points - 1);
  let d = `M0,${yBase + amplitude * Math.sin(phase)}`;
  for (let i = 1; i < points; i++) {
    const x = step * i;
    const y = yBase + amplitude * Math.sin(phase + i * 0.9);
    const cpx1 = step * (i - 0.5);
    const cpy1 = yBase + amplitude * Math.sin(phase + (i - 0.5) * 0.9);
    d += ` Q${cpx1},${cpy1} ${x},${y}`;
  }
  d += ` L${width},300 L0,300 Z`;
  return d;
}

export default function WineWavesAnimation() {
  const containerRef = useRef(null);
  const phaseRef = useRef([0, 0.7, 1.4]);
  const amplitudeRef = useRef(12);
  const targetAmplitude = useRef(12);
  const lastMouseY = useRef(null);
  const lastMouseTime = useRef(null);
  const animFrame = useRef(null);
  const [paths, setPaths] = useState(['', '', '']);
  const [entered, setEntered] = useState(false);

  // Entry animation
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Mouse speed → amplitude
  useEffect(() => {
    const handleMove = (e) => {
      const now = performance.now();
      if (lastMouseY.current !== null && lastMouseTime.current !== null) {
        const dy = Math.abs(e.clientY - lastMouseY.current);
        const dt = now - lastMouseTime.current;
        if (dt > 0) {
          const speed = dy / dt; // px/ms
          targetAmplitude.current = Math.min(28, 12 + speed * 30);
        }
      }
      lastMouseY.current = e.clientY;
      lastMouseTime.current = now;
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  // Gyroscope (mobile)
  useEffect(() => {
    let lastBeta = null;
    let lastTime = null;
    const handleOrientation = (e) => {
      if (e.beta === null) return;
      const now = performance.now();
      if (lastBeta !== null && lastTime !== null) {
        const dBeta = Math.abs(e.beta - lastBeta);
        const dt = now - lastTime;
        if (dt > 0) {
          const speed = dBeta / dt;
          targetAmplitude.current = Math.min(28, 12 + speed * 40);
        }
      }
      lastBeta = e.beta;
      lastTime = now;
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    const width = 1200;
    const speeds = [0.02, 0.035, 0.05]; // back to front

    for (let i = 0; i < 3; i++) {
      phaseRef.current[i] += speeds[i];
    }

    // Smooth amplitude decay
    amplitudeRef.current += (targetAmplitude.current - amplitudeRef.current) * 0.03;
    targetAmplitude.current += (12 - targetAmplitude.current) * 0.01;

    const amp = amplitudeRef.current;
    const newPaths = [
      buildWavePath(width, amp * 0.6, phaseRef.current[0], 40),
      buildWavePath(width, amp * 0.8, phaseRef.current[1], 32),
      buildWavePath(width, amp, phaseRef.current[2], 24),
    ];

    setPaths(newPaths);
    animFrame.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    animFrame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame.current);
  }, [animate]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 bottom-0 overflow-hidden pointer-events-none"
      style={{
        height: '55%',
        transform: entered ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 1.5s cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      {paths.map((d, i) => (
        <svg
          key={i}
          className="absolute inset-x-0 bottom-0 w-full"
          viewBox="0 0 1200 300"
          preserveAspectRatio="none"
          style={{ height: '100%' }}
        >
          <path
            d={d}
            fill={WAVE_COLORS[i].color}
            fillOpacity={WAVE_COLORS[i].opacity}
          />
        </svg>
      ))}
    </div>
  );
}
