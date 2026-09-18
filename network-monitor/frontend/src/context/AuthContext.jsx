import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setAccessToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback((newToken, newUser) => {
    setAccessToken(newToken);
    setToken(newToken);
    setUser(newUser);
    // Explicitly wipe token from localStorage for XSS protection
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      if (newUser) {
        localStorage.setItem('user', JSON.stringify(newUser));
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
    } catch (_) {}

    setAccessToken(null);
    setToken(null);
    setUser(null);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, []);

  // On initial page load / refresh: restore session using HttpOnly refresh cookie
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }

    let isMounted = true;

    async function checkSession() {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.token) {
            setAccessToken(data.token);
            setToken(data.token);
            if (data.user) {
              setUser(data.user);
              localStorage.setItem('user', JSON.stringify(data.user));
            }
          }
        }
      } catch (_) {
        // No active refresh session
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for auth events dispatched by useSocket or API interceptors
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLogout = () => {
      logout();
    };

    const handleRefreshed = (e) => {
      const data = e?.detail;
      if (data && data.token) {
        setAccessToken(data.token);
        setToken(data.token);
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
        }
      }
    };

    window.addEventListener('auth:logout', handleLogout);
    window.addEventListener('auth:refreshed', handleRefreshed);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
      window.removeEventListener('auth:refreshed', handleRefreshed);
    };
  }, [logout]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading, isAuthenticated: !!token }}>
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
