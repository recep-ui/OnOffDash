import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForceChangePassword from '../src/components/ForceChangePassword';

describe('ForceChangePassword Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the forced password change form', () => {
    render(<ForceChangePassword token="mock-token" />);

    expect(screen.getByText('Şifre Değişimi Zorunludur')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mevcut \(Geçici\) Şifre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Yeni Şifre \(En az 8 karakter\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Yeni Şifre \(Tekrar\)/i)).toBeInTheDocument();
  });

  it('should display error if new password is shorter than 8 characters', async () => {
    render(<ForceChangePassword token="mock-token" />);

    fireEvent.change(screen.getByLabelText(/Mevcut \(Geçici\) Şifre/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText(/Yeni Şifre \(En az 8 karakter\)/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/Yeni Şifre \(Tekrar\)/i), { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: /şifreyi güncelle ve giriş yap/i }));

    expect(screen.getByText('Yeni şifre en az 8 karakter uzunluğunda olmalıdır.')).toBeInTheDocument();
  });

  it('should display error if new password and confirmation do not match', async () => {
    render(<ForceChangePassword token="mock-token" />);

    fireEvent.change(screen.getByLabelText(/Mevcut \(Geçici\) Şifre/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText(/Yeni Şifre \(En az 8 karakter\)/i), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByLabelText(/Yeni Şifre \(Tekrar\)/i), { target: { value: 'mismatchpassword' } });

    fireEvent.click(screen.getByRole('button', { name: /şifreyi güncelle ve giriş yap/i }));

    expect(screen.getByText('Yeni şifreler birbiriyle eşleşmiyor.')).toBeInTheDocument();
  });

  it('should successfully submit password change and call onPasswordChanged callback', async () => {
    const mockOnPasswordChanged = vi.fn();
    const updatedUser = { id: 1, username: 'admin', role: 'admin', must_change_password: false };
    const newToken = 'updated-bearer-token';

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: newToken, user: updatedUser }),
    });

    render(<ForceChangePassword token="old-token" onPasswordChanged={mockOnPasswordChanged} />);

    fireEvent.change(screen.getByLabelText(/Mevcut \(Geçici\) Şifre/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText(/Yeni Şifre \(En az 8 karakter\)/i), { target: { value: 'StrongNewPass123!' } });
    fireEvent.change(screen.getByLabelText(/Yeni Şifre \(Tekrar\)/i), { target: { value: 'StrongNewPass123!' } });

    fireEvent.click(screen.getByRole('button', { name: /şifreyi güncelle ve giriş yap/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/change-password', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer old-token'
        })
      }));
      expect(mockOnPasswordChanged).toHaveBeenCalledWith(newToken, updatedUser);
    });
  });
});
