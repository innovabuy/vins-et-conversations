import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { signaturePublicAPI } from '../services/api';
import { Check, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAppSettings } from '../contexts/AppSettingsContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function SignaturePage() {
  const { token } = useParams();
  const { app_name, app_logo_url } = useAppSettings();
  const canvasRef = useRef(null);
  const [blData, setBlData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    signaturePublicAPI.getBLInfo(token)
      .then(res => setBlData(res.data.delivery_note))
      .catch(err => {
        const status = err.response?.status;
        const data = err.response?.data;
        if (status === 404) setError({ type: 'invalid', message: 'Lien invalide' });
        else if (status === 410) setError({ type: 'expired', message: data?.message || 'Ce lien a expire, contactez votre commercial' });
        else if (status === 409) setError({ type: 'signed', message: data?.message || 'Ce bon de livraison a deja ete signe' });
        else setError({ type: 'error', message: 'Erreur de chargement' });
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!blData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
  }, [blData]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
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

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!hasDrawn || !signerName.trim()) return;
    setSubmitting(true);
    try {
      const signatureData = canvasRef.current.toDataURL('image/png');
      await signaturePublicAPI.submitSignature(token, {
        signature_data: signatureData,
        signer_name: signerName.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409) setError({ type: 'signed', message: data?.message });
      else if (err.response?.status === 410) setError({ type: 'expired', message: data?.message });
      else alert(data?.message || 'Erreur lors de la signature');
    } finally {
      setSubmitting(false);
    }
  };

  const appName = app_name || 'Vins & Conversations';
  const logoUrl = app_logo_url;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          {logoUrl ? <img src={logoUrl} alt={appName} className="h-12 mx-auto mb-4" /> : <h1 className="text-xl font-bold text-wine-800 mb-4">{appName}</h1>}
          <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {error.type === 'invalid' ? 'Lien invalide' : error.type === 'expired' ? 'Lien expire' : error.type === 'signed' ? 'Deja signe' : 'Erreur'}
          </h2>
          <p className="text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          {logoUrl ? <img src={logoUrl} alt={appName} className="h-12 mx-auto mb-4" /> : <h1 className="text-xl font-bold text-wine-800 mb-4">{appName}</h1>}
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">BL signe avec succes</h2>
          <p className="text-gray-600">Le bon de livraison <strong>{blData.reference}</strong> a ete signe. Merci !</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-lg mx-auto text-center">
          {logoUrl ? <img src={logoUrl} alt={appName} className="h-10 mx-auto mb-1" /> : <h1 className="text-lg font-bold text-wine-800">{appName}</h1>}
          <p className="text-sm text-gray-500">Bon de Livraison a signer</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* BL Recap */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-500">Reference</p>
              <p className="font-semibold">{blData.reference}</p>
            </div>
            {blData.order_ref && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Commande</p>
                <p className="text-sm text-gray-700">{blData.order_ref}</p>
              </div>
            )}
          </div>
          {blData.recipient_name && (
            <div>
              <p className="text-xs text-gray-500">Destinataire</p>
              <p className="text-sm font-medium">{blData.recipient_name}</p>
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Articles</p>
            <div className="space-y-1.5">
              {blData.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.product_name} <span className="text-gray-400">x{item.qty}</span></span>
                  <span className="font-medium">{formatEur(item.unit_price_ttc * item.qty)}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
              <span>Total TTC</span>
              <span className="text-wine-700">{formatEur(blData.total_ttc)}</span>
            </div>
          </div>
        </div>

        {/* Signer name */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Votre nom *</label>
          <input
            type="text"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            placeholder="Jean Dupont"
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-wine-300 focus:border-wine-500"
            required
          />
        </div>

        {/* Signature canvas */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Signature *</p>
            <button onClick={clearCanvas} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <RotateCcw size={14} /> Effacer
            </button>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
            <canvas
              ref={canvasRef}
              className="w-full touch-none cursor-crosshair"
              style={{ height: '200px' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Dessinez votre signature avec le doigt ou la souris</p>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!hasDrawn || !signerName.trim() || submitting}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-wine-700 text-white font-semibold hover:bg-wine-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Check size={20} />
          {submitting ? 'Signature en cours...' : 'Signer et valider'}
        </button>
      </div>
    </div>
  );
}
