# 5 Yeni Özellik Uygulama Planı — OnOffDash V2

Projenize 5 yeni özellik eklemek için hazırladığınız `Implementationplan.md` dokümanındaki maddeler doğrultusunda aşağıdaki planı oluşturdum. Özellikleri sırasıyla uygulayacağım.

## Hedef Özellikler

1.  **Bildirim Sistemi (Push Notification + Sesli Uyarı)**: Cihaz offline olduğunda, yazıcıda kağıt sıkışması olduğunda veya toner %10 altına düştüğünde tarayıcıda anında bildirim gösterilmesi.
2.  **Toner Düşük Uyarısı + Kırmızı Badge**: Toner seviyesi %10'un altına düştüğünde uyarının backend'de hesaplanıp Dashboard'a ve kartlara yansıtılması.
3.  **Cihaz Detay Modalı (CPU/RAM/Disk Grafikleri)**: Cihazlara tıklandığında açılacak detay modülü ile Recharts kütüphanesi kullanarak 1 saat / 6 saat / 24 saat / 7 gün formatında sistem metriklerinin çizdirilmesi.
4.  **Agent Otomatik Güncelleme**: Agent'ın kendisini otomatik güncelleyebilmesi için backend tarafında versiyon servislerinin hazırlanması ve Agent tarafında updater mimarisinin kurulması.
5.  **Yazılım Envanteri (Yüklü Programlar)**: Agent üzerinden yüklü Windows programlarının (isim, versiyon vb.) toplanıp backend'e raporlanması ve detay modalında gösterilmesi.

> [!IMPORTANT]
> ## User Review Required
> Plana başlamadan önce `Implementationplan.md` dosyanızda yer alan **Açık Sorular (Open Questions)** bölümündeki maddeler için onayınıza/kararınıza ihtiyacım var. Lütfen aşağıdaki soruları yanıtlayın:

## Open Questions

> [!WARNING]
> **Soru 1: Grafik Kütüphanesi**
> Recharts kullanmayı öneriyorum. Hafif, React-native ve kolay entegre ediliyor. Onaylıyor musunuz?

> [!WARNING]
> **Soru 2: Agent Güncelleme Restart Yaklaşımı**
> Agent şu an pkg ile `.exe` olarak paketleniyor. Güncelleme sırasında çalışan exe kendi kendini değiştiremez — ayrı bir "updater" binary gerekir veya Windows scheduled task üzerinden restart yapılır. 
> Sizin tercihiniz nedir? Ayrı bir updater.exe mi yazalım yoksa `.bat` script + Scheduled Task mantığıyla mı ilerleyelim?

> [!WARNING]
> **Soru 3: Yazılım Envanteri Kapsamı**
> `systeminformation` kütüphanesinin `programs()` fonksiyonu yalnızca standart Windows "Add/Remove Programs" (Denetim Masası) listesindeki yazılımları döndürür. Portable uygulamalar veya Store uygulamaları görünmez. Bu sizin senaryonuz için yeterli mi?

## Proposed Changes

### Frontend
- **[NEW] `components/NotificationProvider.jsx`**: Browser Notification ve Audio API entegrasyonu.
- **[NEW] `components/DeviceDetailModal.jsx`**: Recharts tabanlı CPU/RAM/Disk grafikleri ve yazılım listesi.
- **[MODIFY] `components/Dashboard.jsx`**: Modal state yönetimi ve bildirim tetikleyicileri.
- **[MODIFY] `components/SummaryCards.jsx`**: Düşük Toner kartı ve badge'i.
- **[MODIFY] `components/PrinterTable.jsx`**: Düşük toner için CSS (pulse) animasyon eklentisi.
- **[MODIFY] `components/DeviceTable.jsx`**: Cihaz tıklama eventi entegrasyonu.
- **[MODIFY] `index.css`**: Yeni modal, grafik ve animasyon stilleri.
- **[MODIFY] `package.json`**: Recharts bağımlılığının eklenmesi.

### Backend
- **[NEW] `routes/agentUpdate.js`**: Versiyon bilgisi ve dosya indirme endpoint'leri.
- **[NEW] `routes/software.js`**: Agent'tan gelen yazılım listesi endpoint'leri.
- **[NEW] `agent_version.json`**: Güncel versiyon takip dosyası.
- **[MODIFY] `server.js`**: Yeni route tanımlamaları (`/api/agent`, `/api/software`).
- **[MODIFY] `routes/devices.js`**: Heartbeat verileri için zaman filtresi özelliği (`?hours=24`).
- **[MODIFY] `routes/dashboard.js`**: lowToner verisinin `stats` içerisine dönülmesi.
- **[MODIFY] `services/printerMonitorService.js`**: Toner <= %10 koşulunda özel event fırlatılması.
- **[MODIFY] `db/migrations.js`**: Yazılım envanteri için `device_software` tablosunun MSSQL formatında eklenmesi (Bu aslında bir önceki aşamada `software.js` içerisinde yazılmıştı ama `migrations.js`'e de eklenecektir).

### Agent (Windows Client)
- **[NEW] `updater.js`**: Uzak sunucudan yeni exe çekme ve değiştirme mantığı.
- **[NEW] `softwareInfo.js`**: Windows yüklü program listesi toplayıcı.
- **[MODIFY] `agent.js`**: Başlangıçta updater kontrolü ve 6 saatte bir yazılım envanteri gönderimi.
- **[MODIFY] `package.json`**: Gerekli sistem modüllerinin tanımlanması.

## Verification Plan

### Automated Tests
- Backend yeni API uçları için testler.
- Frontend derleme kontrolü (`npm run build`).

### Manual Verification
- Browser üzerinden Push Notification ve ses onay testi.
- Recharts grafiklerinin son 24 saat vs filtrelere doğru yanıt verdiğinin testi.
- Dummy bir yazıcı mock'u üzerinden düşük toner badge'inin gelmesinin testi.
- Agent'ın yeni bir EXE'yi başarılı bir şekilde indirebilme ve restart testleri.
