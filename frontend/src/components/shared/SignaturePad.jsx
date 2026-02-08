import { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';

export default function SignaturePad({ onConfirm, onClose }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const confirm = () => {
    if (!hasDrawn) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onConfirm(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Fermer">
          <X size={24} />
        </button>
        <h2 className="font-semibold text-lg">Signature</h2>
        <div className="w-10" />
      </div>

      <div className="flex-1 p-4 flex flex-col items-center justify-center">
        <p className="text-sm text-gray-500 mb-4">Dessinez votre signature dans le cadre ci-dessous</p>
        <div className="w-full max-w-lg border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
          <canvas
            ref={canvasRef}
            className="w-full touch-none cursor-crosshair"
            style={{ height: '250px' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-4 py-4 border-t">
        <button onClick={clear} className="flex items-center gap-2 px-6 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50" aria-label="Effacer">
          <RotateCcw size={18} />
          Effacer
        </button>
        <button
          onClick={confirm}
          disabled={!hasDrawn}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-wine-700 text-white hover:bg-wine-800 disabled:opacity-40"
          aria-label="Valider la signature"
        >
          <Check size={18} />
          Valider
        </button>
      </div>
    </div>
  );
}
