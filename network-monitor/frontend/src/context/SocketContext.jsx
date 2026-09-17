import { createContext, useContext } from 'react';
import { useSocket } from '../hooks/useSocket';

const SocketContext = createContext({
  connected: false,
  socket: null,
  on: () => {},
  off: () => {}
});

export function SocketProvider({ children }) {
  const socketData = useSocket();

  return (
    <SocketContext.Provider value={socketData}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  return useContext(SocketContext);
}
