import { useState } from 'react';
import FileDropzone from '../../components/pdf/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function SplitPdfPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [rangeStr, setRangeStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFileSelected = (selectedFiles) => {
    if (selectedFiles && selectedFiles.length > 0) {
      setFile(selectedFiles[0]);
      setDownloadUrl(null);
    }
  };

  const handleSplit = async () => {
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen bir PDF dosyası seçin.');
      return;
    }
    if (!rangeStr.trim()) {
      showToast('error', '❌ Hata', 'Lütfen sayfa aralığı belirtin (örn: 1-3, 5).');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('range_str', rangeStr.trim());

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/pdf/split', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Bölme işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Bölme Başarılı', 'Sayfalar başarıyla çıkarıldı.');
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
      await downloadFileWithAuth(url, `bolunmus_${file ? file.name : 'dokuman.pdf'}`);
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
          PDF Sayfa Ayırma (Split)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          PDF belgesinden belirli sayfaları çıkarın. Sayfaları veya aralıkları virgülle ayırarak belirtebilirsiniz.
        </p>

        {!file ? (
          <FileDropzone 
            onFilesSelected={handleFileSelected} 
            multiple={false} 
            placeholderText="Bölünecek PDF dosyasını sürükleyin veya seçin"
          />
        ) : (
          <form onSubmit={handleSplit}>
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
              <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Sayfa Sayıları veya Aralıkları *</label>
              <input
                type="text"
                className="form-control"
                placeholder="Örn: 1-3, 5, 8-12 (Sayfa aralıkları veya tekil sayfalar)"
                value={rangeStr}
                onChange={e => setRangeStr(e.target.value)}
                required
                disabled={loading}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px', display: 'block' }}>
                Format örnekleri: <code style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>1-5</code> (ilk 5 sayfa), <code style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>2,4,7</code> (sadece 2, 4 ve 7. sayfalar), <code style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>1-3, 6-8</code>.
              </small>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={() => { setFile(null); setRangeStr(''); setDownloadUrl(null); }}
                disabled={loading}
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading || !rangeStr.trim()}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'İşleniyor...' : 'Böl ve İndir'}
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
