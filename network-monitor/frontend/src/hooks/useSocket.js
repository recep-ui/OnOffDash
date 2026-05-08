import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({});

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const on = useCallback((event, callback) => {
    const socket = socketRef.current;
    if (!socket) return;

    // Remove existing listener for this event to avoid duplicates
    if (listenersRef.current[event]) {
      socket.off(event, listenersRef.current[event]);
    }

    listenersRef.current[event] = callback;
    socket.on(event, callback);
  }, []);

  const off = useCallback((event) => {
    const socket = socketRef.current;
    if (!socket) return;

    if (listenersRef.current[event]) {
      socket.off(event, listenersRef.current[event]);
      delete listenersRef.current[event];
    }
  }, []);

  return { connected, on, off };
}
