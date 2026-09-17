import { useState } from 'react';
import { Lock, ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react';
import Button from './ui/Button';

export default function ForceChangePassword({ token, onPasswordChanged, onLogout }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Tüm alanları doldurmanız gerekmektedir.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Yeni şifre en az 8 karakter uzunluğunda olmalıdır.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Şifre güncellenemedi.');
      }

      // Success: update auth with new token and unflagged user
      if (onPasswordChanged) {
        onPasswordChanged(data.token, data.user);
      }
    } catch (err) {
      setError(err.message || 'Şifre değiştirilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg-app)',
      fontFamily: 'var(--font-family)',
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '36px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 8px 16px rgba(217, 119, 6, 0.25)'
          }}>
            <ShieldAlert size={28} strokeWidth={2.5} />
          </div>

          <h2 style={{
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
            lineHeight: 1.2
          }}>
            Şifre Değişimi Zorunludur
          </h2>
          <p style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginTop: '6px'
          }}>
            Güvenlik politikası gereği ilk girişte veya parolanız sıfırlandığında yeni bir şifre belirlemeniz gerekmektedir.
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'var(--status-offline-bg)',
            border: '1px solid var(--status-offline-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '13px',
            color: 'var(--status-offline-text)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} color="var(--status-offline)" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" htmlFor="oldPassword">
              Mevcut (Geçici) Şifre
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                <Lock size={16} />
              </span>
              <input
                type="password"
                id="oldPassword"
                className="form-input"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: '38px', height: '42px' }}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" htmlFor="newPassword">
              Yeni Şifre (En az 8 karakter)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                <Lock size={16} />
              </span>
              <input
                type="password"
                id="newPassword"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: '38px', height: '42px' }}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" htmlFor="confirmPassword">
              Yeni Şifre (Tekrar)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                <Lock size={16} />
              </span>
              <input
                type="password"
                id="confirmPassword"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: '38px', height: '42px' }}
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ width: '100%', height: '42px', fontSize: '14px', fontWeight: 600, background: '#d97706', borderColor: '#b45309' }}
          >
            {loading ? 'Şifre Güncelleniyor...' : 'Şifreyi Güncelle ve Giriş Yap'}
          </Button>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}
            >
              Çıkış Yap
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
