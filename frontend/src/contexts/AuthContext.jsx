import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await authAPI.login(email, password);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'commercial';
  const isStudent = user?.role === 'etudiant';
  const isTeacher = user?.role === 'enseignant';
  const isCSE = user?.role === 'cse';
  const isAmbassador = user?.role === 'ambassadeur';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isStudent, isTeacher, isCSE, isAmbassador }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
