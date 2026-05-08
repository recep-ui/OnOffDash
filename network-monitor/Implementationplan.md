5 Yeni Özellik — OnOffDash V2
Bu plan 5 yeni özelliğin eklenmesini kapsar. Özellikler bağımsız ama birbirleriyle etkileşimli olarak tasarlanmıştır.

Özellik 1: Bildirim Sistemi (Push Notification + Sesli Uyarı)
Cihaz offline olduğunda, yazıcıda kağıt sıkışması olduğunda veya toner %10 altına düştüğünde tarayıcıda anında bildirim gösterir.

Frontend
[NEW] NotificationProvider.jsx
Browser Notification API ile push notification
Uygulama açılışında Notification.requestPermission() ile izin isteme
Sesli uyarı için Audio API kullanımı (kısa bir "alert" ses dosyası)
Toast notification sistemi (zaten CSS mevcut — .toast-container)
Bildirim türleri: device:offline, printer:jam, toner:low
[MODIFY] Dashboard.jsx
Socket event listener'lara bildirim tetikleyicileri ekleme
device:statusChanged event'inde oldStatus=online, newStatus=offline ise → bildirim
printer:updated event'inde has_paper_jam=true veya toner düşük ise → bildirim
Özellik 2: Toner Düşük Uyarısı + Kırmızı Badge
Backend
[MODIFY] printerMonitorService.js
Toner seviyesi kontrolü: level / max_capacity < 0.10 ise toner:low event emit
Her yazıcı taramasında düşük toner sayısını hesapla ve stats'a ekle
[MODIFY] routes/dashboard.js
Dashboard stats'a lowToner sayısını ekle
Frontend
[MODIFY] SummaryCards.jsx
Yeni "Düşük Toner" kartı (kırmızı badge ile)
[MODIFY] PrinterTable.jsx
Toner bar'larında %10 altı için kırmızı animasyonlu gösterim (zaten kısmen var, pulse eklenecek)
Özellik 3: Cihaz Detay Modalı (CPU/RAM/Disk Grafikleri)
Frontend
[NEW] DeviceDetailModal.jsx
Bir cihaza tıklayınca açılan detay modal
3 grafik: CPU kullanımı, RAM kullanımı, Disk kullanımı (son 24 saat)
Genel bilgiler (hostname, IP, OS, uptime, agent durumu)
Son heartbeat'ler listesi
Grafik kütüphanesi: Recharts (npm install recharts)
Zaman aralığı seçici: Son 1 saat / 6 saat / 24 saat / 7 gün
[MODIFY] DeviceTable.jsx
Hostname'e tıklanınca DeviceDetailModal açılması
[MODIFY] Dashboard.jsx
DeviceDetailModal state yönetimi ekleme
Backend
[MODIFY] routes/devices.js
GET /api/devices/:id/heartbeats endpoint'ine zaman filtresi ekleme (?hours=24)
Özellik 4: Agent Otomatik Güncelleme
Backend
[NEW] routes/agentUpdate.js
GET /api/agent/version — Güncel agent versiyon bilgisini döner
GET /api/agent/download — Güncel agent exe dosyasını indirir
Versiyon bilgisi agent_version.json dosyasından okunur
[NEW] agent_version.json (backend kökünde)
{ "version": "1.0.0", "minVersion": "1.0.0" }
[MODIFY] server.js
Yeni route'u ekle: app.use('/api/agent', agentUpdateRouter)
Agent
[NEW] updater.js
Başlangıçta sunucudan versiyon kontrolü
Yeni versiyon varsa exe'yi indir, eski exe'yi yedekle, yeni exe ile değiştir
İşlem tamamlandığında kendini yeniden başlat (Windows service üzerinden)
[MODIFY] agent.js
Başlangıçta updater.checkForUpdate() çağrısı
Periyodik güncelleme kontrolü (her 6 saatte bir)
[MODIFY] package.json
Versiyon bilgisini 1.0.0 olarak tutmaya devam
Özellik 5: Yazılım Envanteri (Yüklü Programlar)
Agent
[NEW] softwareInfo.js
systeminformation kütüphanesi ile Windows yüklü programları topla (si.programs() veya registry okuma)
Program adı, versiyon, yayıncı, yükleme tarihi bilgileri
Heartbeat ile birlikte veya ayrı endpoint'e gönder (ayrı tercih ediyorum — büyük veri)
[MODIFY] agent.js
Her 6 saatte bir yazılım listesi gönderme (/api/devices/software)
Backend
[MODIFY] db/migrations.js
Yeni tablo: device_software (device_id, name, version, publisher, install_date)
[NEW] routes/software.js
POST /api/software — Agent'tan yazılım listesi al
GET /api/devices/:id/software — Bir cihazın yazılım listesini döner
[MODIFY] server.js
Yeni route'u ekle
Frontend
[MODIFY] DeviceDetailModal.jsx
"Yüklü Yazılımlar" sekmesi — tablo halinde yazılım listesi
Arama ve sıralama desteği
Open Questions
IMPORTANT

Grafik kütüphanesi: Recharts kullanmayı öneriyorum. Hafif, React-native ve kolay entegre ediliyor. Onaylıyor musunuz?

IMPORTANT

Agent güncelleme: Agent şu an pkg ile .exe olarak paketleniyor. Güncelleme sırasında çalışan exe kendi kendini değiştiremez — bir "updater" binary gerekir veya Windows scheduled task üzerinden restart yapılır. Scheduled task restart yaklaşımını mı önereyim?

IMPORTANT

Yazılım envanteri: systeminformation kütüphanesinin programs() fonksiyonu yalnızca standart Windows "Add/Remove Programs" listesindeki yazılımları döndürür. Portable uygulamalar veya Store uygulamaları görünmez. Bu yeterli mi?

Proposed Changes — Dosya Listesi
Backend
Dosya	İşlem
server.js	MODIFY — Yeni route'lar ekleme
db/migrations.js	MODIFY — device_software tablosu
routes/devices.js	MODIFY — Heartbeat zaman filtresi
routes/dashboard.js	MODIFY — lowToner istatistiği
services/printerMonitorService.js	MODIFY — Toner uyarı event'i
routes/agentUpdate.js	NEW
routes/software.js	NEW
agent_version.json	NEW
Frontend
Dosya	İşlem
package.json	MODIFY — recharts ekleme
components/NotificationProvider.jsx	NEW
components/DeviceDetailModal.jsx	NEW
components/Dashboard.jsx	MODIFY
components/DeviceTable.jsx	MODIFY
components/SummaryCards.jsx	MODIFY
components/PrinterTable.jsx	MODIFY
index.css	MODIFY — Yeni stiller
Agent
Dosya	İşlem
agent.js	MODIFY
config.js	MODIFY
softwareInfo.js	NEW
updater.js	NEW
package.json	MODIFY
Verification Plan
Automated Tests
Backend: Her yeni endpoint'i curl ile test
Frontend: npm run build ile derleme kontrolü
Agent: Heartbeat gönderiminde yazılım verisi olduğunu doğrulama
Manual Verification
Browser'da bildirimleri izin verip test etme
Cihaz detay grafiklerinin doğru render edildiğini kontrol
Dashboard'da düşük toner badge'inin göründüğünü doğrulama