import { getAccessToken } from '../../services/api';
import { useState } from 'react';
import FileDropzone from '../../components/file-tools/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function TextEncodingPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // Form states
  const [inEncoding, setInEncoding] = useState('auto');
  const [outEncoding, setOutEncoding] = useState('utf-8');

  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFileSelected = async (selectedFiles) => {
    const selectedFile = selectedFiles[0];
    setFile(selectedFile);
    setDownloadUrl(null);
    setAnalysis(null);
    await analyzeFile(selectedFile);
  };

  const analyzeFile = async (targetFile) => {
    setAnalyzing(true);
    const formData = new FormData();
    formData.append('file', targetFile);

    const token = getAccessToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/text/analyze-encoding', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analiz işlemi başarısız oldu.');
      }

      const data = await response.json();
      setAnalysis(data);
      if (data.detected_encoding) {
        setInEncoding(data.detected_encoding);
      }
      showToast('success', '🔤 Analiz Tamamlandı', 'Dosya kodlaması otomatik tespit edildi.');
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', 'Dosya analiz edilirken bir hata oluştu: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConvertEncoding = async () => {
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen bir dosya seçin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('in_encoding', inEncoding);
    formData.append('out_encoding', outEncoding);

    const token = getAccessToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/text/convert-encoding', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Kodlama dönüşüm işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Başarılı', 'Dosya kodlaması başarıyla dönüştürüldü.');
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
      await downloadFileWithAuth(url, `kodlanmis_${file ? file.name : 'metin.txt'}`);
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
          Metin Kodlama Dönüştürücü (Transcoding)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          Türkçe karakterleri bozuk görünen dosyaları (Windows-1254, ISO-8859-9, UTF-8 vb.) doğru formata dönüştürün.
        </p>

        <FileDropzone 
          onFilesSelected={handleFileSelected} 
          multiple={false} 
          accept=".txt,.csv,.log"
          placeholderText="Kodlaması dönüştürülecek dosyayı sürükleyin veya seçin"
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
                <span style={{ fontSize: '20px' }}>🔤</span>
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '14px' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatSize(file.size)} {analysis ? `• Algılanan Kodlama: ${analysis.detected_encoding.toUpperCase()}` : ''}
                  </div>
                </div>
              </div>
              <button 
                className="btn btn-ghost" 
                style={{ padding: '6px', fontSize: '12px', color: 'var(--status-offline)' }}
                onClick={() => { setFile(null); setAnalysis(null); setDownloadUrl(null); }}
              >
                🗑️ Kaldır
              </button>
            </div>

            {analyzing && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                ⏳ Dosya analiz ediliyor ve önizleme yükleniyor...
              </div>
            )}

            {analysis && (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '10px' }}>
                    Dosya Önizleme (İlk 1000 karakter)
                  </h4>
                  <textarea 
                    readOnly
                    value={analysis.preview || '(Dosya içeriği boş veya okunamadı)'}
                    style={{
                      width: '100%',
                      height: '180px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-secondary)',
                      padding: '12px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      resize: 'none',
                      lineHeight: '1.5'
                    }}
                  />
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
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Giriş Kodlaması (Encoding)</label>
                    <select 
                      value={inEncoding} 
                      onChange={(e) => setInEncoding(e.target.value)}
                      className="form-control"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                    >
                      <option value="auto">Otomatik Tespit ({analysis.detected_encoding.toUpperCase()})</option>
                      <option value="utf-8">UTF-8</option>
                      <option value="windows-1254">Windows-1254 (Türkçe Windows)</option>
                      <option value="iso-8859-9">ISO-8859-9 (Türkçe ISO)</option>
                      <option value="utf-8-sig">UTF-8 BOM</option>
                      <option value="ascii">ASCII</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Çıkış Kodlaması</label>
                    <select 
                      value={outEncoding} 
                      onChange={(e) => setOutEncoding(e.target.value)}
                      className="form-control"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                    >
                      <option value="utf-8">UTF-8 (Önerilen)</option>
                      <option value="utf-8 bom">UTF-8 BOM (Excel için)</option>
                      <option value="windows-1254">Windows-1254</option>
                      <option value="iso-8859-9">ISO-8859-9</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setFile(null); setAnalysis(null); setDownloadUrl(null); }}
                    disabled={loading}
                  >
                    Temizle
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleConvertEncoding}
                    disabled={loading}
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                      boxShadow: '0 4px 12px var(--accent-blue-glow)'
                    }}
                  >
                    {loading ? 'Dönüştürülüyor...' : 'Dönüştür ve İndir'}
                  </button>
                </div>
              </>
            )}
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
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Kodlama dönüştürme tamamlandı ve dosyanız indirildi.
                </div>
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
