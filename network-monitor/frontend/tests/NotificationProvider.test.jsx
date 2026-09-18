import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import NotificationProvider from '../src/components/NotificationProvider';

describe('NotificationProvider Component (Real Production Module)', () => {
  let mockSocket;
  let socketEventHandlers;

  beforeEach(() => {
    socketEventHandlers = {};
    mockSocket = {
      on: vi.fn((event, handler) => {
        socketEventHandlers[event] = handler;
      }),
      off: vi.fn((event) => {
        delete socketEventHandlers[event];
      }),
    };
  });

  it('MANDATORY REGRESSION TEST: should produce two independent notifications when two different devices go offline simultaneously', () => {
    render(
      <NotificationProvider socket={mockSocket}>
        <div data-testid="child-app">App Content</div>
      </NotificationProvider>
    );

    // Verify socket listener was registered for device:statusChanged
    expect(mockSocket.on).toHaveBeenCalledWith('device:statusChanged', expect.any(Function));
    const statusHandler = socketEventHandlers['device:statusChanged'];

    // Two distinct devices go offline at the same time
    const deviceA = {
      device: { id: 101, hostname: 'SRV-DATABASE-PRIMARY', ip_address: '10.0.10.5' },
      oldStatus: 'online',
      newStatus: 'offline',
      reason: 'ping_timeout',
      timestamp: new Date().toISOString()
    };

    const deviceB = {
      device: { id: 102, hostname: 'SRV-APP-SECONDARY', ip_address: '10.0.10.6' },
      oldStatus: 'online',
      newStatus: 'offline',
      reason: 'ping_timeout',
      timestamp: new Date().toISOString()
    };

    act(() => {
      statusHandler(deviceA);
      statusHandler(deviceB);
    });

    // Both independent notifications must be present in the document
    expect(screen.getByText('SRV-DATABASE-PRIMARY cihazı çevrimdışı oldu')).toBeInTheDocument();
    expect(screen.getByText('SRV-APP-SECONDARY cihazı çevrimdışı oldu')).toBeInTheDocument();

    // Verify 2 error toast alerts are rendered
    const offlineToasts = screen.getAllByText('Cihaz Çevrimdışı');
    expect(offlineToasts.length).toBe(2);
  });

  it('should suppress repeated duplicate notifications for the same device ID within deduplication window', () => {
    render(
      <NotificationProvider socket={mockSocket}>
        <div data-testid="child-app">App Content</div>
      </NotificationProvider>
    );

    const statusHandler = socketEventHandlers['device:statusChanged'];
    const deviceA = {
      device: { id: 201, hostname: 'DESKTOP-FINANCE-01', ip_address: '10.0.20.15' },
      oldStatus: 'online',
      newStatus: 'offline',
      reason: null,
      timestamp: new Date().toISOString()
    };

    // First offline alert
    act(() => {
      statusHandler(deviceA);
    });
    expect(screen.getAllByText('Cihaz Çevrimdışı').length).toBe(1);

    // Immediate repeat offline alert for identical device id (should be deduplicated/suppressed)
    act(() => {
      statusHandler(deviceA);
    });
    expect(screen.getAllByText('Cihaz Çevrimdışı').length).toBe(1);
  });
});
