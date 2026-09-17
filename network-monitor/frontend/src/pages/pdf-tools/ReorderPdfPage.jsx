import { useState } from 'react';
import FileDropzone from '../../components/pdf/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';

export default function ReorderPdfPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFileSelected = async (selectedFiles) => {
    if (selectedFiles && selectedFiles.length > 0) {
      const selectedFile = selectedFiles[0];
      setFile(selectedFile);
      setDownloadUrl(null);
      setPages([]);
      
      // Load page previews from backend
      setLoading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      try {
        const response = await fetch('/api/pdf/preview', {
          method: 'POST',
          headers: headers,
          body: formData
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Sayfa önizlemeleri yüklenemedi.');
        }

        const data = await response.json();
        if (data.previews) {
          const initialPages = data.previews.map((preview, idx) => ({
            id: `page-${idx}-${Date.now()}`,
            index: idx,
            preview: preview,
            rotation: 0
          }));
          setPages(initialPages);
        }
      } catch (err) {
        console.error(err);
        showToast('error', '❌ Hata', err.message || 'Önizlemeler yüklenirken bir hata oluştu.');
        setFile(null);
      } finally {
        setLoading(false);
      }
    }
  };

  const rotatePage = (id) => {
    setPages(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, rotation: (p.rotation + 90) % 360 };
      }
      return p;
    }));
    setDownloadUrl(null);
  };

  const deletePage = (id) => {
    setPages(prev => prev.filter(p => p.id !== id));
    setDownloadUrl(null);
  };

  const movePage = (index, direction) => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === pages.length - 1) return;

    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    const updated = [...pages];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    
    setPages(updated);
    setDownloadUrl(null);
  };

  const handleApplyChanges = async () => {
    if (pages.length === 0) {
      showToast('error', '❌ Hata', 'Kalan sayfa bulunamadı. Lütfen en az 1 sayfa bırakın.');
      return;
    }

    setProcessing(true);
    setDownloadUrl(null);

    // Build the page_configs array
    const configs = pages.map(p => ({
      index: p.index,
      rotation: p.rotation
    }));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('page_configs', JSON.stringify(configs));

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/pdf/reorder', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'PDF düzenleme işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Düzenleme Başarılı', 'PDF sayfa düzenlemeleri başarıyla uygulandı.');
        triggerDownload(result.download_url);
      }
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', err.message || 'Düzenleme uygulanırken hata oluştu.');
    } finally {
      setProcessing(false);
    }
  };

  const triggerDownload = (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `duzenlenmis_${file.name}`;
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
          PDF Sayfa Düzenle (Reorder, Rotate, Delete)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          PDF belgenizin sayfalarını görsel olarak düzenleyin. Sayfaları döndürebilir, silebilir veya yerlerini değiştirebilirsiniz.
        </p>

        {!file && (
          <FileDropzone 
            onFilesSelected={handleFileSelected} 
            multiple={false} 
            placeholderText="Düzenlenecek PDF dosyasını sürükleyin veya seçin"
          />
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <span style={{ fontSize: '32px', display: 'inline-block', animation: 'spin 1s linear infinite' }}>🔄</span>
            <div style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              PDF sayfaları analiz ediliyor ve önizlemeler oluşturuluyor...
            </div>
          </div>
        )}

        {file && !loading && pages.length > 0 && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>📄</span>
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '13px' }}>{file.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pages.length} sayfa yüklenmiş</div>
                </div>
              </div>
              <button 
                type="button" 
                className="btn btn-ghost"
                onClick={() => { setFile(null); setPages([]); setDownloadUrl(null); }}
                style={{ color: 'var(--status-offline)' }}
              >
                Kapat / Değiştir
              </button>
            </div>

            {/* Grid of pages */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', 
              gap: '20px',
              marginBottom: '24px'
            }}>
              {pages.map((page, index) => (
                <div 
                  key={page.id} 
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Page index badge */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'rgba(0,0,0,0.6)',
                    color: 'var(--text-primary)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    zIndex: '10'
                  }}>
                    Sayfa {index + 1}
                  </div>

                  {/* Original Page Tag */}
                  {page.index !== index && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'var(--accent-blue)',
                      color: '#fff',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      zIndex: '10'
                    }}>
                      Orj: {page.index + 1}
                    </div>
                  )}

                  {/* Thumbnail Image Wrapper */}
                  <div style={{
                    width: '100%',
                    height: '180px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    marginBottom: '8px',
                    padding: '4px'
                  }}>
                    <img 
                      src={page.preview} 
                      alt={`Page ${index + 1}`} 
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: `rotate(${page.rotation}deg)`,
                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                      }}
                    />
                  </div>

                  {/* Controls */}
                  <div style={{ 
                    display: 'flex', 
                    width: '100%', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: 'auto'
                  }}>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button 
                        className="btn btn-ghost" 
                        disabled={index === 0}
                        onClick={() => movePage(index, 'left')}
                        style={{ padding: '4px 6px', fontSize: '11px' }}
                        title="Sola Taşı"
                      >
                        ◀
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        disabled={index === pages.length - 1}
                        onClick={() => movePage(index, 'right')}
                        style={{ padding: '4px 6px', fontSize: '11px' }}
                        title="Sağa Taşı"
                      >
                        ▶
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button 
                        className="btn btn-ghost" 
                        onClick={() => rotatePage(page.id)}
                        style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--accent-blue)' }}
                        title="Döndür"
                      >
                        🔄
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        onClick={() => deletePage(page.id)}
                        style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--status-offline)' }}
                        title="Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => handleFileSelected([file])} // re-analyzes same file
                disabled={processing}
              >
                Sıfırla
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleApplyChanges}
                disabled={processing || pages.length === 0}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {processing ? 'Uygulanıyor...' : 'Düzenlemeleri Kaydet ve İndir'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && !processing && (
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
