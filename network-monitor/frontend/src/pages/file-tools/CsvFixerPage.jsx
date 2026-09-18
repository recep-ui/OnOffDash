import { getAccessToken } from '../../services/api';
import { useState } from 'react';
import FileDropzone from '../../components/file-tools/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function CsvFixerPage({ onBack }) {
  const { showToast } = useNotification();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // Form states
  const [inDelimiter, setInDelimiter] = useState('auto');
  const [outDelimiter, setOutDelimiter] = useState(';');
  const [inEncoding, setInEncoding] = useState('auto');
  const [outEncoding, setOutEncoding] = useState('utf-8');
  const [cleanEmptyRows, setCleanEmptyRows] = useState(true);
  const [cleanWhitespace, setCleanWhitespace] = useState(true);
  const [exportBom, setExportBom] = useState(true);

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
      const response = await fetch('/api/file-tools/csv/analyze', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analiz işlemi başarısız oldu.');
      }

      const data = await response.json();
      setAnalysis(data);
      // Pre-fill fields with detected settings
      if (data.detected_delimiter) {
        setInDelimiter(data.detected_delimiter);
      }
      if (data.detected_encoding) {
        setInEncoding(data.detected_encoding);
      }
      showToast('success', '📊 Analiz Tamamlandı', 'Dosya ayracı ve kodlama yapısı otomatik tespit edildi.');
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', 'Dosya analiz edilirken bir hata oluştu: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFixCsv = async () => {
    if (!file) {
      showToast('error', '❌ Hata', 'Lütfen bir CSV/TXT dosyası yükleyin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('in_delimiter', inDelimiter);
    formData.append('out_delimiter', outDelimiter);
    formData.append('in_encoding', inEncoding);
    formData.append('out_encoding', outEncoding);
    formData.append('clean_empty_rows', cleanEmptyRows ? 'true' : 'false');
    formData.append('clean_whitespace', cleanWhitespace ? 'true' : 'false');
    formData.append('export_bom', exportBom ? 'true' : 'false');
    formData.append('has_header', 'true');

    const token = getAccessToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/csv/fix', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Düzeltme işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Başarılı', 'CSV dosyası başarıyla düzeltildi.');
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
      await downloadFileWithAuth(url, `duzeltilmis_${file ? file.name : 'dosya.csv'}`);
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
          CSV Düzenleyici
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          Bozuk Türkçe karakterleri düzeltin, kolon ayraçlarını değiştirin (virgülden noktalı virgüle vb.) ve Excel uyumlu CSV'ler üretin.
        </p>

        <FileDropzone 
          onFilesSelected={handleFileSelected} 
          multiple={false} 
          accept=".csv,.txt,.log"
          placeholderText="Düzeltilecek CSV veya metin dosyasını sürükleyin veya seçin"
        />

        {file && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Yüklenen Belge
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
                <span style={{ fontSize: '20px' }}>📊</span>
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '14px' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatSize(file.size)} {analysis ? `• ${analysis.row_count} Satır • ${analysis.col_count} Sütun` : ''}
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
                {analysis.warnings && analysis.warnings.length > 0 && (
                  <div style={{
                    padding: '12px 16px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid var(--status-warning)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--status-warning)',
                    fontSize: '13px',
                    marginBottom: '20px'
                  }}>
                    ⚠️ {analysis.warnings.join(', ')}
                  </div>
                )}

                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '10px' }}>
                    İlk 10 Satır Önizleme
                  </h4>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)' }}>
                    <table className="device-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)' }}>
                          {analysis.headers && analysis.headers.map((header, idx) => (
                            <th key={idx} style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: '600' }}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.preview_rows && analysis.preview_rows.slice(1).map((row, rowIdx) => (
                          <tr key={rowIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Giriş Ayracı</label>
                    <select 
                      value={inDelimiter} 
                      onChange={(e) => setInDelimiter(e.target.value)}
                      className="form-control"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                    >
                      <option value="auto">Otomatik Tespit ({analysis.detected_delimiter})</option>
                      <option value=";">Noktalı Virgül (;)</option>
                      <option value=",">Virgül (,)</option>
                      <option value="&#9;">Tab (\t)</option>
                      <option value="|">Dikey Çizgi (|)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Çıkış Ayracı (Excel için ; önerilir)</label>
                    <select 
                      value={outDelimiter} 
                      onChange={(e) => setOutDelimiter(e.target.value)}
                      className="form-control"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                    >
                      <option value=";">Noktalı Virgül (;)</option>
                      <option value=",">Virgül (,)</option>
                      <option value="&#9;">Tab (\t)</option>
                      <option value="|">Dikey Çizgi (|)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Giriş Kodlaması (Encoding)</label>
                    <select 
                      value={inEncoding} 
                      onChange={(e) => setInEncoding(e.target.value)}
                      className="form-control"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                    >
                      <option value="auto">Otomatik Tespit ({analysis.detected_encoding})</option>
                      <option value="utf-8">UTF-8</option>
                      <option value="windows-1254">Windows-1254 (Türkçe)</option>
                      <option value="utf-8-sig">UTF-8 BOM</option>
                      <option value="iso-8859-9">ISO-8859-9</option>
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
                      <option value="utf-8">UTF-8</option>
                      <option value="windows-1254">Windows-1254 (Türkçe)</option>
                      <option value="iso-8859-9">ISO-8859-9</option>
                    </select>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '20px',
                  marginBottom: '20px',
                  padding: '4px'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <input 
                      type="checkbox" 
                      checked={cleanEmptyRows} 
                      onChange={(e) => setCleanEmptyRows(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Boş Satırları Temizle
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <input 
                      type="checkbox" 
                      checked={cleanWhitespace} 
                      onChange={(e) => setCleanWhitespace(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Baş/Son Boşlukları Kırp
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <input 
                      type="checkbox" 
                      checked={exportBom} 
                      disabled={outEncoding !== 'utf-8'}
                      onChange={(e) => setExportBom(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    UTF-8 BOM Ekle (Excel Türkçe Desteği İçin)
                  </label>
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
                    onClick={handleFixCsv}
                    disabled={loading}
                    style={{
                      background: 'linear-gradient(135deg, var(--status-online), var(--accent-blue))',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    {loading ? 'Düzeltiliyor...' : 'Düzelt ve İndir'}
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
                <div style={{ fontWeight: '500', color: 'var(--status-online)' }}>CSV Dosyanız Hazır!</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Düzeltilmiş dosyanız otomatik olarak indirildi.
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
