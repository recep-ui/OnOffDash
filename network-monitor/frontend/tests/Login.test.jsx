import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../src/components/Login';

describe('Login Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render login form with username, password fields and submit button', () => {
    render(<Login onLogin={vi.fn()} />);

    expect(screen.getByLabelText('Kullanıcı Adı')).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /giriş yap/i })).toBeInTheDocument();
  });

  it('should display error if submitted with empty username or password', async () => {
    render(<Login onLogin={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /giriş yap/i });
    fireEvent.submit(submitBtn.closest('form'));

    expect(screen.getByText('Kullanıcı adı ve şifre gereklidir.')).toBeInTheDocument();
  });

  it('should display server error message on failed login attempt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Hatalı kullanıcı adı veya şifre.' }),
    });

    render(<Login onLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /giriş yap/i }));

    await waitFor(() => {
      expect(screen.getByText('Hatalı kullanıcı adı veya şifre.')).toBeInTheDocument();
    });
  });

  it('should invoke onLogin callback with token and user on successful authentication', async () => {
    const mockOnLogin = vi.fn();
    const fakeToken = 'valid-jwt-token-12345';
    const fakeUser = { id: 1, username: 'admin', role: 'admin', must_change_password: false };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: fakeToken, user: fakeUser }),
    });

    render(<Login onLogin={mockOnLogin} />);

    fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'correctpassword123' } });
    fireEvent.click(screen.getByRole('button', { name: /giriş yap/i }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith(fakeToken, fakeUser);
    });
  });
});
