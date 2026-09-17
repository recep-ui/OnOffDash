import { useState } from 'react';
import FileDropzone from '../../components/file-tools/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function PngToJpgPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState(80);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [resultSizes, setResultSizes] = useState(null);

  const handleFileSelected = (selectedFiles) => {
    setFile(selectedFiles[0]);
    setDownloadUrl(null);
    setResultSizes(null);
  };

  const handleConvert = async () => {
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen bir PNG dosyası seçin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);
    setResultSizes(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('quality', quality);
    formData.append('bg_color', bgColor);

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/image/png-to-jpg', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Dönüştürme işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        setResultSizes({
          original: result.original_size,
          new: result.new_size
        });
        showToast('success', '✅ Başarılı', 'PNG başarıyla JPG formatına dönüştürüldü.');
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
      const fallbackName = file ? `${file.name.substring(0, file.name.lastIndexOf('.'))}.jpg` : 'converted.jpg';
      await downloadFileWithAuth(url, fallbackName);
    } catch (err) {
      showToast('error', '❌ İndirme Hatası', err.message || 'Dosya indirilemedi.');
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="pdf-tool-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: '18px', padding: '6px 12px' }}>
          ⬅ Geri
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
          PNG ➔ JPG Dönüştürücü
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          PNG dosyalarınızı JPG formatına dönüştürün. Şeffaf (transparent) alanlar için arka plan rengi belirleyebilirsiniz.
        </p>

        <FileDropzone 
          onFilesSelected={handleFileSelected} 
          multiple={false} 
          accept=".png"
          placeholderText="Dönüştürülecek PNG görselini sürükleyin veya seçin"
        />

        {file && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Seçilen Dosya
            </h3>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                <span style={{ fontSize: '20px' }}>🖼️</span>
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '14px' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatSize(file.size)}
                  </div>
                </div>
              </div>
              <button 
                className="btn btn-ghost" 
                style={{ padding: '6px', fontSize: '12px', color: 'var(--status-offline)' }}
                onClick={() => { setFile(null); setDownloadUrl(null); }}
              >
                🗑️ Kaldır
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '24px',
              marginBottom: '20px',
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              alignItems: 'center'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Çıktı Kalitesi: <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{quality}%</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Düşük (40)</span>
                  <input 
                    type="range" 
                    min="40" 
                    max="90" 
                    value={quality} 
                    onChange={(e) => setQuality(parseInt(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Yüksek (90)</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Arka Plan Rengi (Şeffaf alanlar için)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="color" 
                    value={bgColor} 
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', width: '40px', height: '40px' }}
                  />
                  <input 
                    type="text" 
                    value={bgColor} 
                    onChange={(e) => setBgColor(e.target.value)}
                    className="form-control"
                    style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => { setFile(null); setDownloadUrl(null); }}
                disabled={loading}
              >
                Temizle
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleConvert}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'Dönüştürülüyor...' : 'Dönüştür ve İndir'}
              </button>
            </div>
          </div>
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
                <div style={{ fontWeight: '500', color: 'var(--status-online)' }}>JPG Dosyanız Hazır!</div>
                {resultSizes && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Boyut: {formatSize(resultSizes.original)} (PNG) ➔ {formatSize(resultSizes.new)} (JPG)
                  </div>
                )}
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
