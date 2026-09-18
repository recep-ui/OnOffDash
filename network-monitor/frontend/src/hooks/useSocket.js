import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, setAccessToken } from '../services/api';

export function useSocket(tokenParam) {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({});

  const activeToken = tokenParam !== undefined ? tokenParam : getAccessToken();

  useEffect(() => {
    // If no token is available, disconnect and clean up
    if (!activeToken) {
      if (socketRef.current) {
        console.log('🔌 Socket disconnected due to missing token');
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    // Connect with JWT auth
    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: { token: activeToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('🔌 Socket connected:', socketInstance.id);
      setConnected(true);

      // Re-attach existing event listeners (deduplicating to prevent double-firing on reconnect)
      Object.keys(listenersRef.current).forEach(event => {
        const callback = listenersRef.current[event];
        if (callback) {
          socketInstance.off(event);
          socketInstance.on(event, callback);
        }
      });
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      setConnected(false);
    });

    socketInstance.on('auth:revoked', () => {
      console.warn('🔌 Socket received session revocation.');
      socketInstance.disconnect();
      setAccessToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:logout'));
      }
    });

    socketInstance.on('connect_error', async (err) => {
      const isAuthError = err && err.message && (
        err.message.includes('Authentication error') ||
        err.message.includes('token required') ||
        err.message.includes('invalid or expired') ||
        err.message.includes('password change required')
      );

      if (isAuthError) {
        console.warn('🔌 Socket authentication failed. Halting reconnect loop:', err.message);

        // 1. Halt reconnection loop immediately
        socketInstance.disconnect();
        if (socketRef.current === socketInstance) {
          socketRef.current = null;
          setSocket(null);
          setConnected(false);
        }

        // 2. Invoke token refresh mechanism using HttpOnly cookie
        try {
          const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });

          if (res.ok) {
            const data = await res.json();
            if (data.token) {
              setAccessToken(data.token);
              if (data.user && typeof window !== 'undefined') {
                localStorage.setItem('user', JSON.stringify(data.user));
              }
              // Dispatch event so application and useSocket re-render with new token
              window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: data }));
              return;
            }
          }
        } catch (refreshErr) {
          console.error('Socket token refresh failed:', refreshErr);
        }

        // 3. If refresh failed, transition to logged-out state cleanly
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.dispatchEvent(new Event('auth:logout'));
        }
      }
    });

    return () => {
      socketInstance.disconnect();
      if (socketRef.current === socketInstance) {
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
    };
  }, [activeToken]);

  const on = useCallback((event, callback) => {
    listenersRef.current[event] = callback;
    const s = socketRef.current;
    if (s && s.connected) {
      s.off(event);
      s.on(event, callback);
    }
  }, []);

  const off = useCallback((event) => {
    delete listenersRef.current[event];
    const s = socketRef.current;
    if (s) {
      s.off(event);
    }
  }, []);

  return { connected, on, off, socket };
}
