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

  it('should initialize with unauthenticated state when localStorage is empty', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-out');
    expect(screen.getByTestId('username').textContent).toBe('none');
    expect(screen.getByTestId('token').textContent).toBe('none');
  });

  it('should load initial credentials from localStorage if present', () => {
    localStorage.setItem('token', 'initial-jwt-token');
    localStorage.setItem('user', JSON.stringify({ id: 5, username: 'stored_admin', role: 'admin' }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-in');
    expect(screen.getByTestId('username').textContent).toBe('stored_admin');
    expect(screen.getByTestId('token').textContent).toBe('initial-jwt-token');
  });

  it('should save token and user to localStorage and update state on login()', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      screen.getByText('Do Login').click();
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-in');
    expect(screen.getByTestId('username').textContent).toBe('operator1');
    expect(screen.getByTestId('token').textContent).toBe('token-123');
    expect(localStorage.getItem('token')).toBe('token-123');
  });

  it('should clear localStorage and update state on logout()', () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'user1' }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      screen.getByText('Do Logout').click();
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('logged-out');
    expect(screen.getByTestId('token').textContent).toBe('none');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
