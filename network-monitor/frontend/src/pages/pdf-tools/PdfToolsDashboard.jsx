import { useState } from 'react';
import {
  FileText,
  Layers,
  Scissors,
  ArrowUpDown,
  Archive,
  Tag,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import MergePdfPage from './MergePdfPage';
import SplitPdfPage from './SplitPdfPage';
import ReorderPdfPage from './ReorderPdfPage';
import CompressPdfPage from './CompressPdfPage';
import WatermarkPdfPage from './WatermarkPdfPage';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

export default function PdfToolsDashboard() {
  const [activeTool, setActiveTool] = useState(null);

  const tools = [
    {
      id: 'merge',
      title: 'PDF Birleştir',
      description: 'Birden fazla PDF belgesini sırasıyla birleştirerek tek bir PDF haline getirin.',
      icon: Layers,
      color: '#2563eb',
      bgColor: '#eff6ff'
    },
    {
      id: 'split',
      title: 'PDF Böl / Sayfa Ayır',
      description: 'PDF belgesinden belirlediğiniz sayfaları çıkartarak yeni bir PDF oluşturun.',
      icon: Scissors,
      color: '#06b6d4',
      bgColor: '#ecfeff'
    },
    {
      id: 'reorder',
      title: 'PDF Düzenle & Sırala',
      description: 'Sayfa sıralamasını değiştirin, sayfaları döndürün veya fazlalıkları silin.',
      icon: ArrowUpDown,
      color: '#8b5cf6',
      bgColor: '#f5f3ff'
    },
    {
      id: 'compress',
      title: 'PDF Sıkıştır',
      description: 'Görüntü kalitesini optimize ederek PDF belgenizin dosya boyutunu küçültün.',
      icon: Archive,
      color: '#f59e0b',
      bgColor: '#fffbeb'
    },
    {
      id: 'watermark',
      title: 'Filigran Ekle',
      description: 'Tüm sayfalara yarı saydam metin filigranı (KOPYA, TASLAK vb.) ekleyin.',
      icon: Tag,
      color: '#10b981',
      bgColor: '#ecfdf5'
    }
  ];

  if (activeTool === 'merge') {
    return <MergePdfPage onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'split') {
    return <SplitPdfPage onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'reorder') {
    return <ReorderPdfPage onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'compress') {
    return <CompressPdfPage onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'watermark') {
    return <WatermarkPdfPage onBack={() => setActiveTool(null)} />;
  }

  return (
    <div className="pdf-tools-page">
      <PageHeader
        title="PDF Araçları"
        subtitle="Belgelerinizi tamamen lokal ağda ve güvenli bir şekilde dönüştürün ve optimize edin."
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '20px'
      }}>
        {tools.map(tool => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.id}
              className="card"
              onClick={() => setActiveTool(tool.id)}
              style={{
                padding: '24px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)'
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: tool.bgColor,
                color: tool.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={24} />
              </div>

              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {tool.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {tool.description}
                </p>
              </div>

              <div style={{
                marginTop: 'auto',
                fontSize: '12.5px',
                fontWeight: 600,
                color: tool.color,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                Aracı Başlat <ArrowRight size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
