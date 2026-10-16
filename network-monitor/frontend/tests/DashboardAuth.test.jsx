import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../src/components/Dashboard';
import { useAuth } from '../src/context/AuthContext';
import { io } from 'socket.io-client';
import * as api from '../src/services/api';

vi.mock('../src/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: vi.fn() }));
vi.mock('../src/components/layout/AppShell', () => ({
  default: () => <div>Authenticated dashboard</div>
}));
vi.mock('../src/services/api', async importOriginal => ({
  ...await importOriginal(),
  fetchDashboardStats: vi.fn(),
  fetchDevices: vi.fn(),
  fetchDepartments: vi.fn(),
  fetchPrinters: vi.fn()
}));

describe('Dashboard first-login authentication', () => {
  let auth;

  beforeEach(() => {
    vi.clearAllMocks();
    auth = {
      token: 'bootstrap-token',
      user: { id: 1, username: 'admin', role: 'admin', must_change_password: true },
      login: vi.fn(), logout: vi.fn(), loading: false
    };
    useAuth.mockImplementation(() => auth);
    io.mockReturnValue({ connected: false, on: vi.fn(), off: vi.fn(), disconnect: vi.fn() });
    api.fetchDashboardStats.mockResolvedValue({ devices: {}, printers: {} });
    api.fetchDevices.mockResolvedValue([]);
    api.fetchDepartments.mockResolvedValue([]);
    api.fetchPrinters.mockResolvedValue([]);
  });

  it('keeps the required password form open without starting sockets or protected requests', async () => {
    render(<Dashboard />);
    expect(screen.getByText('Şifre Değişimi Zorunludur')).toBeInTheDocument();
    await waitFor(() => {
      expect(io).not.toHaveBeenCalled();
      expect(api.fetchDashboardStats).not.toHaveBeenCalled();
      expect(api.fetchDevices).not.toHaveBeenCalled();
      expect(api.fetchDepartments).not.toHaveBeenCalled();
      expect(api.fetchPrinters).not.toHaveBeenCalled();
    });
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('starts the dashboard only after the password-change response supplies an unrestricted session', async () => {
    const { rerender } = render(<Dashboard />);
    expect(screen.getByText('Şifre Değişimi Zorunludur')).toBeInTheDocument();
    expect(io).not.toHaveBeenCalled();

    auth = { ...auth, token: 'password-changed-token', user: { ...auth.user, must_change_password: false } };
    rerender(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Authenticated dashboard')).toBeInTheDocument();
      expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        auth: { token: 'password-changed-token' }
      }));
      expect(api.fetchDashboardStats).toHaveBeenCalledTimes(1);
      expect(api.fetchDevices).toHaveBeenCalledTimes(1);
      expect(api.fetchDepartments).toHaveBeenCalledTimes(1);
      expect(api.fetchPrinters).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Şifre Değişimi Zorunludur')).not.toBeInTheDocument();
  });
});
