import { useState } from 'react';
import FileDropzone from '../../components/pdf/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function MergePdfPage({ onBack }) {
  const { showToast } = useNotification();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFilesSelected = (selectedFiles) => {
    setFiles(prev => [...prev, ...selectedFiles]);
    setDownloadUrl(null);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setDownloadUrl(null);
  };

  const moveFile = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === files.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updatedFiles = [...files];
    const temp = updatedFiles[index];
    updatedFiles[index] = updatedFiles[newIndex];
    updatedFiles[newIndex] = temp;

    setFiles(updatedFiles);
    setDownloadUrl(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      showToast('warning', '⚠️ Uyarı', 'Lütfen en az 2 PDF dosyası seçin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const response = await fetch('/api/pdf/merge', {
        method: 'POST',
        headers: {
          ...(localStorage.getItem('token') ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {})
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Birleştirme işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Başarılı', 'PDF dosyaları başarıyla birleştirildi.');
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
      await downloadFileWithAuth(url, 'birlesmis_dokuman.pdf');
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
          PDF Birleştirme (Merge)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          Birden fazla PDF belgesini yükleyin, sıralarını düzenleyin ve tek bir PDF dosyası haline getirin.
        </p>

        <FileDropzone 
          onFilesSelected={handleFilesSelected} 
          multiple={true} 
          placeholderText="Birleştirilecek PDF dosyalarını sürükleyin veya seçin"
        />

        {files.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Yüklenen Belgeler ({files.length})
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {files.map((file, index) => (
                <div 
                  key={index} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 'var(--radius-md)',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '20px' }}>📄</span>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ 
                        fontWeight: '500', 
                        color: 'var(--text-primary)', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        fontSize: '14px'
                      }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button 
                      className="btn btn-ghost" 
                      style={{ padding: '6px', fontSize: '12px' }}
                      disabled={index === 0}
                      onClick={() => moveFile(index, 'up')}
                      title="Yukarı Taşı"
                    >
                      ▲
                    </button>
                    <button 
                      className="btn btn-ghost" 
                      style={{ padding: '6px', fontSize: '12px' }}
                      disabled={index === files.length - 1}
                      onClick={() => moveFile(index, 'down')}
                      title="Aşağı Taşı"
                    >
                      ▼
                    </button>
                    <button 
                      className="btn btn-ghost" 
                      style={{ padding: '6px', fontSize: '12px', color: 'var(--status-offline)' }}
                      onClick={() => removeFile(index)}
                      title="Kaldır"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setFiles([])}
                disabled={loading}
              >
                Listeyi Temizle
              </button>
              
              <button 
                className="btn btn-primary" 
                onClick={handleMerge}
                disabled={loading || files.length < 2}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'Birleştiriliyor...' : 'Birleştir ve İndir'}
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
