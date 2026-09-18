import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // Listen for auth events dispatched by useSocket or API interceptors
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleLogout = () => {
      logout();
    };
    const handleRefreshed = () => {
      const newToken = localStorage.getItem('token');
      const newUserStr = localStorage.getItem('user');
      if (newToken) setToken(newToken);
      if (newUserStr) {
        try { setUser(JSON.parse(newUserStr)); } catch (_) {}
      }
    };
    window.addEventListener('auth:logout', handleLogout);
    window.addEventListener('auth:refreshed', handleRefreshed);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
      window.removeEventListener('auth:refreshed', handleRefreshed);
    };
  });

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
