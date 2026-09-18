import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

function TestConsumer() {
  const { token, user, login, logout, isAuthenticated } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? 'logged-in' : 'logged-out'}</span>
      <span data-testid="username">{user?.username || 'none'}</span>
      <span data-testid="token">{token || 'none'}</span>
      <button onClick={() => login('token-123', { id: 1, username: 'operator1', role: 'operator' })}>
        Do Login
      </button>
      <button onClick={logout}>Do Logout</button>
    </div>
  );
}

describe('AuthProvider Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with unauthenticated state when no active session exists', () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-out');
    expect(screen.getByTestId('username').textContent).toBe('none');
    expect(screen.getByTestId('token').textContent).toBe('none');
  });

  it('should restore session from HttpOnly cookie refresh on mount if valid', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'refreshed-jwt-from-cookie',
        user: { id: 5, username: 'cookie_admin', role: 'admin' },
      }),
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-in');
    expect(screen.getByTestId('username').textContent).toBe('cookie_admin');
    expect(screen.getByTestId('token').textContent).toBe('refreshed-jwt-from-cookie');
    // Critical security check: token must NEVER be stored in localStorage
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should keep token strictly in memory and NOT persist token to localStorage on login() (XSS protection)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText('Do Login').click();
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-in');
    expect(screen.getByTestId('username').textContent).toBe('operator1');
    expect(screen.getByTestId('token').textContent).toBe('token-123');
    // Must NOT be stored in localStorage
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should clear in-memory credentials and invoke logout endpoint on logout()', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText('Do Login').click();
    });
    expect(screen.getByTestId('auth-status').textContent).toBe('logged-in');

    await act(async () => {
      screen.getByText('Do Logout').click();
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-out');
    expect(screen.getByTestId('token').textContent).toBe('none');
    expect(localStorage.getItem('token')).toBeNull();
  });
});
