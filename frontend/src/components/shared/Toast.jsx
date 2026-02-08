import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 border-green-200' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 border-yellow-200' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200' },
};

function ToastItem({ toast, onDismiss }) {
  const { icon: Icon, color, bg } = ICONS[toast.type] || ICONS.info;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${bg} animate-slide-in max-w-sm`}>
      <Icon size={18} className={`${color} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        {toast.title && <p className="font-semibold text-sm text-gray-900">{toast.title}</p>}
        <p className="text-sm text-gray-700">{toast.message}</p>
      </div>
      <button onClick={() => onDismiss(toast.id)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message, title, duration) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message, title, duration }]);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message, title) => addToast('success', message, title),
    error: (message, title) => addToast('error', message, title),
    warning: (message, title) => addToast('warning', message, title),
    info: (message, title) => addToast('info', message, title),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
