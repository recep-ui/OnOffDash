import { useState } from 'react';
import FileDropzone from '../../components/file-tools/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';

export default function ImageResizePage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [keepAspect, setKeepAspect] = useState(true);
  const [scalePercent, setScalePercent] = useState('');
  const [outputFormat, setOutputFormat] = useState('JPEG');
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [resultSizes, setResultSizes] = useState(null);

  const handleFileSelected = (selectedFiles) => {
    setFile(selectedFiles[0]);
    setDownloadUrl(null);
    setResultSizes(null);
  };

  const handleResize = async () => {
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen bir görsel dosyası seçin.');
      return;
    }

    if (!width && !height && !scalePercent) {
      showToast('error', '❌ Hata', 'Lütfen yeni boyut genişlik/yükseklik değerleri girin veya yüzde oran girin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);
    setResultSizes(null);

    const formData = new FormData();
    formData.append('file', file);
    if (width) formData.append('width', width);
    if (height) formData.append('height', height);
    formData.append('keep_aspect', keepAspect ? 'true' : 'false');
    if (scalePercent) formData.append('scale_percent', scalePercent);
    formData.append('output_format', outputFormat);

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/image/resize', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Boyutlandırma işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        setResultSizes({
          original: result.original_size,
          new: result.new_size
        });
        showToast('success', '✅ Başarılı', 'Görsel başarıyla boyutlandırıldı.');
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
    const ext = outputFormat.toLowerCase() === 'jpeg' ? 'jpg' : outputFormat.toLowerCase();
    const link = document.createElement('a');
    link.href = url;
    link.download = `boyutlandirilmis_gorsel.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          Görsel Boyutlandır
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          Görsellerinizi piksel cinsinden veya oran belirterek lokal ortamda boyutlandırın.
        </p>

        <FileDropzone 
          onFilesSelected={handleFileSelected} 
          multiple={false} 
          accept="image/*"
          placeholderText="Boyutlandırılacak görseli sürükleyin veya seçin (PNG, JPG, JPEG, WEBP)"
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
              gap: '16px',
              marginBottom: '20px',
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Genişlik (piksel)</label>
                <input 
                  type="number" 
                  value={width} 
                  onChange={(e) => { setWidth(e.target.value); setScalePercent(''); }}
                  placeholder="örn. 1920" 
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Yükseklik (piksel)</label>
                <input 
                  type="number" 
                  value={height} 
                  onChange={(e) => { setHeight(e.target.value); setScalePercent(''); }}
                  placeholder="örn. 1080" 
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input 
                    type="checkbox" 
                    checked={keepAspect} 
                    onChange={(e) => setKeepAspect(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  En-Boy Oranını Koru
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Veya Yüzdeyle Küçült (%)</label>
                <input 
                  type="number" 
                  value={scalePercent} 
                  onChange={(e) => { setScalePercent(e.target.value); setWidth(''); setHeight(''); }}
                  placeholder="örn. 50" 
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Çıktı Formatı</label>
                <select 
                  value={outputFormat} 
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  <option value="JPEG">JPEG (.jpg)</option>
                  <option value="PNG">PNG</option>
                  <option value="WEBP">WEBP</option>
                </select>
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
                onClick={handleResize}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'İşleniyor...' : 'Boyutlandır ve İndir'}
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
                <div style={{ fontWeight: '500', color: 'var(--status-online)' }}>Görseliniz Hazır!</div>
                {resultSizes && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Dosya Boyutu: <span style={{ textDecoration: 'line-through' }}>{formatSize(resultSizes.original)}</span> ➔ <span style={{ fontWeight: 'bold' }}>{formatSize(resultSizes.new)}</span>
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
