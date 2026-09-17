import { useState } from 'react';
import FileDropzone from '../../components/pdf/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function CompressPdfPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [quality, setQuality] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFileSelected = (selectedFiles) => {
    if (selectedFiles && selectedFiles.length > 0) {
      setFile(selectedFiles[0]);
      setDownloadUrl(null);
    }
  };

  const handleCompress = async (e) => {
    e?.preventDefault();
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen sıkıştırılacak bir PDF dosyası seçin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('quality', quality);

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/pdf/compress', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Sıkıştırma işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Sıkıştırma Başarılı', 'PDF dosyası başarıyla sıkıştırıldı.');
        triggerDownload(result.download_url);
      }
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', err.message || 'Sunucu hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = async (url) => {
    try {
      await downloadFileWithAuth(url, `sikistirilmis_${file ? file.name : 'dokuman.pdf'}`);
    } catch (err) {
      showToast('error', '❌ İndirme Hatası', err.message || 'Dosya indirilemedi.');
    }
  };

  return (
    <div className="pdf-tool-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: '18px', padding: '6px 12px' }}>
          ⬅ Geri
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
          PDF Sıkıştırma (Compress)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          PDF belgenizin dosya boyutunu küçültün. Kalite ve sıkıştırma oranı arasındaki dengeyi seçebilirsiniz.
        </p>

        {!file ? (
          <FileDropzone 
            onFilesSelected={handleFileSelected} 
            multiple={false} 
            placeholderText="Sıkıştırılacak PDF dosyasını sürükleyin veya seçin"
          />
        ) : (
          <form onSubmit={handleCompress}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              background: 'var(--bg-secondary)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>📄</span>
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '14px' }}>{file.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                </div>
              </div>
              <button 
                type="button" 
                className="btn btn-ghost"
                onClick={() => { setFile(null); setDownloadUrl(null); }}
                style={{ color: 'var(--status-offline)' }}
              >
                Değiştir
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>Sıkıştırma Seviyesi</label>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div 
                  onClick={() => !loading && setQuality('low')}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${quality === 'low' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.06)'}`,
                    background: quality === 'low' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>📉</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: quality === 'low' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>Düşük Sıkıştırma</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Yüksek Kalite / Büyük Boyut</div>
                </div>

                <div 
                  onClick={() => !loading && setQuality('medium')}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${quality === 'medium' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.06)'}`,
                    background: quality === 'medium' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>⚖️</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: quality === 'medium' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>Orta Sıkıştırma</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Dengeli Kalite & Boyut</div>
                </div>

                <div 
                  onClick={() => !loading && setQuality('high')}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${quality === 'high' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.06)'}`,
                    background: quality === 'high' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>⚡</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: quality === 'high' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>Yüksek Sıkıştırma</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Düşük Kalite / Minimum Boyut</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={() => { setFile(null); setQuality('medium'); setDownloadUrl(null); }}
                disabled={loading}
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'Sıkıştırılıyor...' : 'Sıkıştır ve İndir'}
              </button>
            </div>
          </form>
        )}

        {downloadUrl && !loading && (
          <div style={{ 
            marginTop: '24px', 
            padding: '16px', 
            background: 'var(--status-online-bg)', 
            border: '1px solid var(--status-online)', 
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🎉</span>
              <div>
                <div style={{ fontWeight: '500', color: 'var(--status-online)' }}>Dosyanız Hazır!</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Otomatik indirme başlamadıysa sağdaki butona tıklayabilirsiniz.</div>
              </div>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={() => triggerDownload(downloadUrl)}
              style={{ background: 'var(--status-online)', border: 'none' }}
            >
              Dosyayı İndir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
