import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({});

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('🔌 Socket connected:', socketInstance.id);
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      setConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      if (err && err.message && err.message.includes('Authentication error')) {
        console.warn('🔌 Socket authentication required:', err.message);
      }
    });

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, []);

  const on = useCallback((event, callback) => {
    const s = socketRef.current;
    if (!s) return;

    // Remove existing listener for this event to avoid duplicates
    if (listenersRef.current[event]) {
      s.off(event, listenersRef.current[event]);
    }

    listenersRef.current[event] = callback;
    s.on(event, callback);
  }, []);

  const off = useCallback((event) => {
    const s = socketRef.current;
    if (!s) return;

    if (listenersRef.current[event]) {
      s.off(event, listenersRef.current[event]);
      delete listenersRef.current[event];
    }
  }, []);

  return { connected, on, off, socket };
}
