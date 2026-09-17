import { useState, useRef } from 'react';

export default function FileDropzone({ 
  onFilesSelected, 
  accept = "*", 
  multiple = false, 
  maxSizeMB = 50,
  placeholderText = "Dosyaları buraya sürükleyin veya seçmek için tıklayın"
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateAndProcessFiles = (filesList) => {
    const validFiles = [];
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const blacklist = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.vbs', '.scr', '.js', '.vbe', '.jse', '.wsf', '.wsh', '.pif'];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      // Check executable blacklist
      if (blacklist.includes(fileExt)) {
        alert(`Güvenlik nedeniyle bu dosya türü kabul edilemez: ${file.name}`);
        continue;
      }
      
      // Extension validation
      if (accept !== "*") {
        const allowedExts = accept.split(',').map(ext => ext.trim().toLowerCase());
        const isAllowed = allowedExts.some(ext => {
          if (ext.startsWith('.')) {
            return fileExt === ext;
          }
          // handle mime types if passed, like image/*
          if (ext.endsWith('/*')) {
            const baseMime = ext.replace('/*', '');
            return file.type.startsWith(baseMime);
          }
          return file.type === ext;
        });

        if (!isAllowed) {
          alert(`Geçersiz dosya formatı: ${file.name}. İzin verilenler: ${accept}`);
          continue;
        }
      }

      if (file.size > maxSizeBytes) {
        alert(`Dosya boyutu çok büyük: ${file.name}. Maksimum ${maxSizeMB}MB dosyalar kabul edilir.`);
        continue;
      }

      validFiles.push(file);
      if (!multiple) break; // If not multiple, only take first valid file
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
      e.target.value = null; // reset to allow choosing the same file again
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div 
      className={`file-dropzone ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={onButtonClick}
      style={{
        border: '2px dashed rgba(59, 130, 246, 0.3)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 20px',
        textAlign: 'center',
        background: isDragActive ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)',
        borderColor: isDragActive ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        boxShadow: 'var(--glass-shadow)',
        marginBottom: '20px'
      }}
    >
      <input 
        ref={fileInputRef}
        type="file" 
        multiple={multiple} 
        accept={accept} 
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
      
      <div style={{
        fontSize: '40px',
        color: isDragActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
        transform: isDragActive ? 'scale(1.1)' : 'scale(1)',
        transition: 'transform 0.2s ease'
      }}>
        📥
      </div>

      <div style={{ fontWeight: '500', fontSize: '15px', color: 'var(--text-primary)' }}>
        {placeholderText}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        Maksimum dosya boyutu: {maxSizeMB}MB
      </div>
    </div>
  );
}
