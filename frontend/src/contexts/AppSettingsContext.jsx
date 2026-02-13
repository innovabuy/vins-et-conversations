import { createContext, useContext, useState, useEffect } from 'react';
import { appSettingsAPI } from '../services/api';

const AppSettingsContext = createContext(null);

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    app_logo_url: '',
    app_name: 'Vins & Conversations',
    app_primary_color: '#722F37',
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    appSettingsAPI.getPublic()
      .then((res) => {
        setSettings((prev) => ({ ...prev, ...res.data }));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const refresh = async () => {
    try {
      const res = await appSettingsAPI.getPublic();
      setSettings((prev) => ({ ...prev, ...res.data }));
    } catch {
      // ignore
    }
  };

  return (
    <AppSettingsContext.Provider value={{ ...settings, loaded, refresh }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    return {
      app_logo_url: '',
      app_name: 'Vins & Conversations',
      app_primary_color: '#722F37',
      loaded: false,
      refresh: () => {},
    };
  }
  return ctx;
}
