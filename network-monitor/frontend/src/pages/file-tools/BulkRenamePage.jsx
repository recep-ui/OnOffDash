import { useState, useEffect } from 'react';
import FileDropzone from '../../components/file-tools/FileDropzone';
import { useNotification } from '../../components/NotificationProvider';
import { downloadFileWithAuth } from '../../services/api';

export default function BulkRenamePage({ onBack }) {
  const { showToast } = useNotification();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Rules states
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [replaceSpaces, setReplaceSpaces] = useState(false);
  const [simplifyTurkish, setSimplifyTurkish] = useState(true);
  const [caseMode, setCaseMode] = useState('none'); // 'none', 'lower', 'upper'
  const [sequencing, setSequencing] = useState(false);
  const [addDate, setAddDate] = useState(false);

  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFilesSelected = (selectedFiles) => {
    setFiles(prev => [...prev, ...selectedFiles]);
    setDownloadUrl(null);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setDownloadUrl(null);
  };

  // Run preview when files or rules change
  useEffect(() => {
    if (files.length === 0) {
      setPreview([]);
      return;
    }

    const fetchPreview = async () => {
      setLoadingPreview(true);
      try {
        const response = await fetch('/api/file-tools/rename/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filenames: files.map(f => f.name),
            rules: {
              prefix,
              suffix,
              replace_spaces: replaceSpaces,
              simplify_turkish: simplifyTurkish,
              case_mode: caseMode,
              sequencing,
              add_date: addDate
            }
          })
        });

        if (!response.ok) {
          throw new Error('Önizleme alınamadı.');
        }

        const result = await response.json();
        if (result.success && result.preview) {
          setPreview(result.preview);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPreview(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchPreview();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [files, prefix, suffix, replaceSpaces, simplifyTurkish, caseMode, sequencing, addDate]);

  const handleApplyRename = async () => {
    if (files.length === 0) {
      showToast('error', '❌ Hata', 'Lütfen en az bir dosya seçin.');
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const rulesObj = {
      prefix,
      suffix,
      replace_spaces: replaceSpaces,
      simplify_turkish: simplifyTurkish,
      case_mode: caseMode,
      sequencing,
      add_date: addDate
    };

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('rules', JSON.stringify(rulesObj));

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await fetch('/api/file-tools/rename/apply', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Yeniden adlandırma işlemi başarısız oldu.');
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setDownloadUrl(result.download_url);
        showToast('success', '✅ Başarılı', 'Dosyalar başarıyla isimlendirildi ve ZIP olarak paketlendi.');
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
      await downloadFileWithAuth(url, 'isimlendirilmis_dosyalar.zip');
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
          Toplu Yeniden Adlandır (Bulk Rename)
        </h2>
      </div>

      <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          Gelişmiş kurallarla birden fazla dosyayı tek seferde yeniden adlandırın. Çıktılar bir ZIP arşivi olarak sunulacaktır.
        </p>

        <FileDropzone 
          onFilesSelected={handleFilesSelected} 
          multiple={true} 
          accept="*"
          placeholderText="Yeniden adlandırılacak dosyaları sürükleyin veya seçin"
        />

        {files.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '12px' }}>
              İsimlendirme Kuralları
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Önek (Prefix)</label>
                <input 
                  type="text" 
                  value={prefix} 
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="örn. rapor_" 
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Sonek (Suffix)</label>
                <input 
                  type="text" 
                  value={suffix} 
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="örn. _son" 
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Harf Büyüklüğü</label>
                <select 
                  value={caseMode} 
                  onChange={(e) => setCaseMode(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  <option value="none">Değiştirme</option>
                  <option value="lower">tümünü küçük harf yap (abc)</option>
                  <option value="upper">TÜMÜNÜ BÜYÜK HARF YAP (ABC)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input 
                    type="checkbox" 
                    checked={replaceSpaces} 
                    onChange={(e) => setReplaceSpaces(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Boşlukları Alt Çizgi (_) Yap
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input 
                    type="checkbox" 
                    checked={simplifyTurkish} 
                    onChange={(e) => setSimplifyTurkish(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Türkçe Karakterleri Sadeleştir
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input 
                    type="checkbox" 
                    checked={sequencing} 
                    onChange={(e) => setSequencing(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Sıralı Numara Ekle (örn. _001, _002)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input 
                    type="checkbox" 
                    checked={addDate} 
                    onChange={(e) => setAddDate(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Tarih Öneki Ekle (YYYY-MM-DD_)
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Yeniden Adlandırma Önizleme {loadingPreview && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}> (Güncelleniyor...)</span>}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Toplam: {files.length} dosya</span>
              </h4>
              
              <div style={{ overflowX: 'auto', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', maxHeight: '350px', overflowY: 'auto' }}>
                <table className="device-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)' }}>
                      <th style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: '600', width: '45%' }}>Eski Dosya Adı</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: '600', width: '45%' }}>Yeni Dosya Adı</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: '600', width: '10%' }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.old_name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--accent-blue)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.new_name}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <button 
                            className="btn btn-ghost" 
                            style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--status-offline)' }}
                            onClick={() => removeFile(idx)}
                          >
                            Kaldır
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setFiles([])}
                disabled={loading}
              >
                Tümünü Temizle
              </button>
              
              <button 
                className="btn btn-primary" 
                onClick={handleApplyRename}
                disabled={loading || files.length === 0}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))',
                  boxShadow: '0 4px 12px var(--accent-blue-glow)'
                }}
              >
                {loading ? 'Uygulanıyor...' : 'İsimlendir ve ZIP Olarak İndir'}
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
                <div style={{ fontWeight: '500', color: 'var(--status-online)' }}>Yeniden Adlandırma Tamamlandı!</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Yeniden adlandırılmış dosyalarınızı içeren ZIP paketi indirildi.</div>
              </div>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={() => triggerDownload(downloadUrl)}
              style={{ background: 'var(--status-online)', border: 'none' }}
            >
              ZIP İndir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
