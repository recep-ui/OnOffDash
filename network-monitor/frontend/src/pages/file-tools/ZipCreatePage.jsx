import { useState } from 'react';
import FileDropzone from '../../components/file-tools/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';

export default function ZipCreatePage({ onBack }) {
  const { showToast } = useNotification();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compressionLevel, setCompressionLevel] = useState('normal');
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFilesSelected = (selectedFiles) => {
    setFiles(prev => [...prev, ...selectedFiles]);
    setDownloadUrl(null);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setDownloadUrl(null);
  };

  const handleCreateZip = async () => {
    if (files.length === 0) {
      showToast('error', '❌ Hata', 'Lütfen en az bir dosya ekleyin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('compression_level', compressionLevel);

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/zip/create', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'ZIP oluşturma işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ ZIP Oluşturuldu', 'Tüm dosyalar başarıyla paketlendi.');
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
    link.download = 'arsiv.zip';
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

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="pdf-tool-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: '18px', padding: '6px 12px' }}>
          ⬅ Geri
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
          ZIP Arşivi Oluştur
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          Birden fazla dosyayı tek bir ZIP arşivi içinde lokal ağda güvenle paketleyin.
        </p>

        <FileDropzone 
          onFilesSelected={handleFilesSelected} 
          multiple={true} 
          accept="*"
          placeholderText="Paketlenecek dosyaları sürükleyin veya seçin"
        />

        {files.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Eklenecek Dosyalar ({files.length}) - Toplam: {formatSize(totalSize)}
            </h3>
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px', 
              marginBottom: '20px',
              maxHeight: '300px',
              overflowY: 'auto',
              paddingRight: '6px'
            }}>
              {files.map((file, index) => (
                <div 
                  key={index} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 'var(--radius-md)',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '18px' }}>📄</span>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ 
                        fontWeight: '500', 
                        color: 'var(--text-primary)', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        fontSize: '13px'
                      }}>
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
                    onClick={() => removeFile(index)}
                    title="Kaldır"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '20px',
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              alignItems: 'center'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Sıkıştırma Seviyesi</label>
                <select 
                  value={compressionLevel} 
                  onChange={(e) => setCompressionLevel(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  <option value="fast">Hızlı (Düşük Sıkıştırma)</option>
                  <option value="normal">Normal (Dengeli)</option>
                  <option value="maximum">Maksimum (Yavaş - Yüksek Sıkıştırma)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setFiles([])}
                disabled={loading}
              >
                Tümünü Temizle
              </button>
              
              <button 
                className="btn btn-primary" 
                onClick={handleCreateZip}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'ZIP Oluşturuluyor...' : 'ZIP Oluştur ve İndir'}
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
                <div style={{ fontWeight: '500', color: 'var(--status-online)' }}>ZIP Arşivi Hazır!</div>
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
