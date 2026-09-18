import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../src/hooks/useSocket';
import { io } from 'socket.io-client';

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn()
  };
});

describe('useSocket Hook', () => {
  let mockSocketInstance;
  let eventCallbacks;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    eventCallbacks = {};

    mockSocketInstance = {
      connected: false,
      on: vi.fn((ev, cb) => { eventCallbacks[ev] = cb; }),
      off: vi.fn((ev) => { delete eventCallbacks[ev]; }),
      disconnect: vi.fn(() => { mockSocketInstance.connected = false; }),
    };

    io.mockReturnValue(mockSocketInstance);
  });

  it('should not initiate connection when token is null or missing', () => {
    const { result } = renderHook(() => useSocket(null));

    expect(io).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('should initiate Socket.IO connection with active token in auth payload', () => {
    renderHook(() => useSocket('valid-bearer-token'));

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: 'valid-bearer-token' }
      })
    );
  });

  it('should halt reconnect and disconnect immediately upon authentication error', async () => {
    const logoutSpy = vi.fn();
    window.addEventListener('auth:logout', logoutSpy);

    // Mock fetch for token refresh failure
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid refresh token' })
    });

    renderHook(() => useSocket('expired-token'));

    // Trigger connect_error with Authentication error
    act(() => {
      if (eventCallbacks['connect_error']) {
        eventCallbacks['connect_error'](new Error('Authentication error: invalid or expired token'));
      }
    });

    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
  });
});
