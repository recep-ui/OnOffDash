import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useSocket(tokenParam) {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({});

  const activeToken = tokenParam !== undefined ? tokenParam : (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

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

    socketInstance.on('connect_error', (err) => {
      if (err && err.message && err.message.includes('Authentication error')) {
        console.warn('🔌 Socket authentication failed:', err.message);
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
