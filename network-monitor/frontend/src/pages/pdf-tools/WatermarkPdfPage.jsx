import { useState } from 'react';
import FileDropzone from '../../components/pdf/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';

export default function WatermarkPdfPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [color, setColor] = useState('#ef4444');
  const [opacity, setOpacity] = useState(0.3);
  const [fontSize, setFontSize] = useState(50);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFileSelected = (selectedFiles) => {
    if (selectedFiles && selectedFiles.length > 0) {
      setFile(selectedFiles[0]);
      setDownloadUrl(null);
    }
  };

  const handleWatermark = async (e) => {
    e.preventDefault();
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen filigran eklenecek bir PDF dosyası seçin.');
      return;
    }
    if (!text.trim()) {
      showToast('error', '❌ Hata', 'Lütfen filigran metnini girin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('text', text);
    formData.append('color', color);
    formData.append('opacity', opacity.toString());
    formData.append('font_size', fontSize.toString());
    formData.append('rotation', rotation.toString());

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/pdf/watermark', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Filigran ekleme işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Başarılı', 'Filigran başarıyla eklendi.');
        triggerDownload(result.download_url);
      }
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', err.message || 'Sunucu hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `filigranli_${file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pdf-tool-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: '18px', padding: '6px 12px' }}>
          ⬅ Geri
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
          PDF Filigran Ekleme (Watermark)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          PDF belgenizin tüm sayfalarına yarı saydam bir metin filigranı yerleştirin.
        </p>

        {!file ? (
          <FileDropzone 
            onFilesSelected={handleFileSelected} 
            multiple={false} 
            placeholderText="Filigran eklenecek PDF dosyasını sürükleyin veya seçin"
          />
        ) : (
          <form onSubmit={handleWatermark}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Filigran Metni *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Örn: KOPYA, GİZLİ, TASLAK"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Metin Rengi</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-control"
                    style={{ padding: '2px', height: '38px', width: '60px', cursor: 'pointer' }}
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    disabled={loading}
                  />
                  <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    {color.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Yazı Boyutu ({fontSize}px)</label>
                <input
                  type="range"
                  min="20"
                  max="120"
                  step="5"
                  className="form-control"
                  style={{ height: '38px', cursor: 'pointer' }}
                  value={fontSize}
                  onChange={e => setFontSize(parseInt(e.target.value))}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Şeffaflık (Opacity: {Math.round(opacity * 100)}%)</label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  className="form-control"
                  style={{ height: '38px', cursor: 'pointer' }}
                  value={opacity}
                  onChange={e => setOpacity(parseFloat(e.target.value))}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Döndürme Açısı</label>
                <select
                  className="form-control"
                  value={rotation}
                  onChange={e => setRotation(parseInt(e.target.value))}
                  disabled={loading}
                >
                  <option value="0">0° (Yatay)</option>
                  <option value="90">90° (Dikey)</option>
                  <option value="180">180° (Ters Yatay)</option>
                  <option value="270">270° (Ters Dikey)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={() => { setFile(null); setText(''); setDownloadUrl(null); }}
                disabled={loading}
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading || !text.trim()}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'Ekleniyor...' : 'Filigran Ekle ve İndir'}
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
