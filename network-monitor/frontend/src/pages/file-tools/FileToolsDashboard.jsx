import { useState } from 'react';
import {
  FileCode,
  Image,
  Minimize2,
  FileSpreadsheet,
  Type,
  Archive,
  Edit3,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import ImageResizePage from './ImageResizePage';
import ImageCompressPage from './ImageCompressPage';
import PngToJpgPage from './PngToJpgPage';
import JpgToPngPage from './JpgToPngPage';
import CsvFixerPage from './CsvFixerPage';
import TextEncodingPage from './TextEncodingPage';
import ZipCreatePage from './ZipCreatePage';
import BulkRenamePage from './BulkRenamePage';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';

export default function FileToolsDashboard() {
  const [activeTool, setActiveTool] = useState(null);

  const tools = [
    {
      id: 'resize',
      title: 'Görsel Boyutlandır',
      description: 'Görsel boyutlarını en-boy oranını koruyarak veya serbest şekilde değiştirin.',
      icon: Minimize2,
      color: '#2563eb',
      bgColor: '#eff6ff'
    },
    {
      id: 'compress',
      title: 'Görsel Sıkıştır',
      description: 'Görsellerinizin kalitesini koruyarak dosya boyutunu optimize edin.',
      icon: Archive,
      color: '#f59e0b',
      bgColor: '#fffbeb'
    },
    {
      id: 'png-to-jpg',
      title: 'PNG ➔ JPG Dönüştür',
      description: 'PNG görsellerini JPG formatına çevirin ve arka plan rengi belirleyin.',
      icon: Image,
      color: '#06b6d4',
      bgColor: '#ecfeff'
    },
    {
      id: 'jpg-to-png',
      title: 'JPG ➔ PNG Dönüştür',
      description: 'JPG formatındaki görsellerinizi şeffaflık destekleyen PNG formatına çevirin.',
      icon: Sparkles,
      color: '#8b5cf6',
      bgColor: '#f5f3ff'
    },
    {
      id: 'csv-fixer',
      title: 'CSV Düzenleyici & Ayırıcı',
      description: 'CSV ayraçlarını ve encoding hatalarını düzeltip Excel uyumlu hale getirin.',
      icon: FileSpreadsheet,
      color: '#10b981',
      bgColor: '#ecfdf5'
    },
    {
      id: 'text-encoding',
      title: 'Metin Kodlama (Encoding)',
      description: 'Türkçe karakter sorunu yaşayan metin dosyalarınızın kodlamasını UTF-8 yapın.',
      icon: Type,
      color: '#2563eb',
      bgColor: '#eff6ff'
    },
    {
      id: 'zip-create',
      title: 'ZIP Arşivi Oluşturucu',
      description: 'Birden fazla dosyayı güvenli şekilde tek bir ZIP arşivi halinde paketleyin.',
      icon: Archive,
      color: '#06b6d4',
      bgColor: '#ecfeff'
    },
    {
      id: 'bulk-rename',
      title: 'Toplu Yeniden Adlandır',
      description: 'Belirli kurallara göre çok sayıda dosyanın adını toplu olarak değiştirin.',
      icon: Edit3,
      color: '#8b5cf6',
      bgColor: '#f5f3ff'
    }
  ];

  if (activeTool === 'resize') return <ImageResizePage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'compress') return <ImageCompressPage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'png-to-jpg') return <PngToJpgPage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'jpg-to-png') return <JpgToPngPage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'csv-fixer') return <CsvFixerPage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'text-encoding') return <TextEncodingPage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'zip-create') return <ZipCreatePage onBack={() => setActiveTool(null)} />;
  if (activeTool === 'bulk-rename') return <BulkRenamePage onBack={() => setActiveTool(null)} />;

  return (
    <div className="file-tools-page">
      <PageHeader
        title="Dosya Araçları"
        subtitle="Dosyalarınızı lokal ağ içinde hızlı, güvenli ve veritabanına yük bindirmeden düzenleyin."
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
