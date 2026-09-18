# OnOffDash V2 - Proje Analiz Raporu

Bu rapor, **OnOffDash V2** (Ağ İzleme ve Yönetim Paneli) projesinin dizin yapısı, mimarisi, teknoloji yığını, veritabanı şeması ve mevcut özelliklerinin detaylı bir incelemesini içermektedir.

---

## 1. Genel Mimari ve Proje Yapısı

OnOffDash V2, ağdaki cihazları (PC, sunucu, yazıcı vb.) izlemek ve detaylı sistem metrikleri toplamak amacıyla geliştirilmiş üç ana katmandan oluşan bir uygulamadır:

1.  **Backend (API & Monitoring Server):** Express.js tabanlı olup cihazlara ping atma, yazıcılardan SNMP/Web Scraper ile durum toplama ve Agent'lardan gelen heartbeat/yazılım envanteri verilerini işleme görevini üstlenir. Canlı veriler Socket.IO aracılığıyla frontend'e iletilir.
2.  **Frontend (Dashboard Arayüzü):** React (Vite) ile geliştirilmiştir. CSS tabanlı glassmorphism tasarımı ve Recharts kütüphanesiyle zenginleştirilmiş grafikler sunar.
3.  **Agent (Windows Client):** İzlenen hedef makinelere kurulan hafif bir Node.js servisidir. Donanım metriklerini (CPU, RAM, Disk), işletim sistemi bilgilerini ve yüklü program envanterini sunucuya gönderir. Ayrıca kendini otomatik güncelleyebilmektedir.

### Dosya Dağılımı ve Bağlantılar

*   [Kök Dizin (network-monitor)](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor)
    *   [docker-compose.yml](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/docker-compose.yml) - Çoklu konteyner yapılandırması
    *   [README.md](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/README.md) - Kurulum kılavuzu
    *   [task.md](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/task.md) - Özelliklerin durum listesi
    *   [backend/](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend) - Sunucu kaynak kodları
    *   [frontend/](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend) - Arayüz kaynak kodları
    *   [agent/](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/agent) - İstemci (Agent) kaynak kodları

---

## 2. Teknoloji Yığını (Tech Stack)

### **Backend**
*   **Çatı (Framework):** Express.js (v4.21.2) & Node.js
*   **Veritabanı Sürücüsü:** `mssql` (SQL Server - v11.0.1)
    *   *Not:* [connection.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/db/connection.js) dosyası, PostgreSQL stili `$1, $2` sorgularını MSSQL `@p1, @p2` parametre yapısına dönüştürerek simüle edilmiş bir `pg` havuzu API'si sunar.
*   **Gerçek Zamanlı İletişim:** `socket.io` (v4.8.1)
*   **Ağ Kontrolü:** `ping` (v0.4.4)
*   **Yazıcı İzleme:** `net-snmp` (v3.26.3) ve `cheerio`/`axios` (Fallback Web Scraper)
*   **Zamanlanmış Görevler:** `node-cron` (v3.0.3)

### **Frontend**
*   **Yapılandırıcı:** Vite (v8.0.10) & React (v19.2.5)
*   **Grafikler:** Recharts (v3.8.1)
*   **Tasarım:** Vanilla CSS (Glassmorphism ve modern renk paletleri)
*   **Haberleşme:** `socket.io-client` (v4.8.3)

### **Agent**
*   **Sistem Bilgileri:** `systeminformation` (v5.31.5)
*   **Haberleşme:** `node-fetch` (v2.7.0)
*   **Derleme/Paketleme:** `pkg` (Node.js script'ini bağımsız `.exe` haline getirir)

---

## 3. Veritabanı Şeması Analizi

[db/migrations.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/db/migrations.js) dosyasında tanımlanan şemaya göre veriler SQL Server (MSSQL) üzerinde şu tablolarla tutulmaktadır:

*   `devices`: İzlenen cihazların temel bilgileri (hostname, IP, MAC, departman, OS, durum, vb.).
*   `device_status_logs`: Cihazların geçmiş online/offline durum değişiklikleri ve yanıt süreleri.
*   `heartbeats`: Agent yüklü cihazlardan gelen CPU, RAM, Disk kullanımı ve Uptime (çalışma süresi) logları.
*   `printers`: Ağ yazıcılarının genel bilgileri, kağıt sıkışma durumu ve toplam sayfa sayaçları.
*   `printer_toners`: Yazıcılara ait toner renkleri ve doluluk seviyeleri.
*   `printer_jam_logs`: Yazıcılardaki kağıt sıkışma hatalarının geçmişi.
*   `device_software`: Cihazlarda kurulu olan yazılımların listesi.

---

## 4. Görevler ve Gerçek Durum Analizi

`task.md` dosyasında bazı görevler tamamlanmamış görünse de, kaynak kodlar incelendiğinde **tüm 5 özelliğin de aslında kod seviyesinde başarıyla tamamlandığı** görülmüştür:

| Özellik | task.md Durumu | Kod Seviyesindeki Gerçek Durum | İlgili Kod Dosyaları |
| :--- | :--- | :--- | :--- |
| **1. Bildirim Sistemi** | `[x]` Tamamlandı | **Tamamlandı.** Tarayıcı bildirimleri ve sesli uyarı entegre edilmiş durumda. | [NotificationProvider.jsx](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend/src/components/NotificationProvider.jsx), [Dashboard.jsx](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend/src/components/Dashboard.jsx) |
| **2. Toner Düşük Uyarısı** | `[/]` Kısmen | **Tamamlandı.** Backend'de `%10` altı için `toner:low` fırlatılıyor, dashboard stats'a dahil ediliyor ve frontend'de kırmızı uyarı ile pulse animasyonu çalışıyor. | [printerMonitorService.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/services/printerMonitorService.js), [dashboard.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/routes/dashboard.js), [SummaryCards.jsx](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend/src/components/SummaryCards.jsx), [PrinterTable.jsx](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend/src/components/PrinterTable.jsx) |
| **3. Cihaz Detay Modalı (Grafikler)**| `[ ]` Yapılmadı | **Tamamlandı.** Recharts kullanılarak CPU, RAM, Disk grafikleri (1s/6s/24s/7g filtreli) detay modalında gösteriliyor. | [DeviceDetailModal.jsx](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend/src/components/DeviceDetailModal.jsx), [devices.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/routes/devices.js) |
| **4. Agent Otomatik Güncelleme** | `[ ]` Yapılmadı | **Tamamlandı.** Backend'de versiyon/indirme API'leri hazır. Agent tarafında `.bat` tabanlı updater mekanizması kurulmuş. | [agentUpdate.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/routes/agentUpdate.js), [updater.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/agent/updater.js), [agent.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/agent/agent.js) |
| **5. Yazılım Envanteri** | `[ ]` Yapılmadı | **Tamamlandı.** Agent; Registry, Store ve Servisleri PowerShell ve systeminformation ile toplayıp bulk olarak gönderiyor. Frontend'de modal içinde arama ve filtreleme ile gösteriliyor. | [softwareInfo.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/agent/softwareInfo.js), [software.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/routes/software.js), [DeviceDetailModal.jsx](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/frontend/src/components/DeviceDetailModal.jsx) |

---

## 5. İnceleme Sonuçları ve Kritik Bulgular

1.  **Veritabanı Katmanı:** Proje mimarisinde PostgreSQL ile SQL Server arasında geçiş yapılmış. Kod tabanında MSSQL (`mssql` paketi) kullanılıyor ancak pg havuz yapısına benzer bir Wrapper ([connection.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/backend/db/connection.js)) tercih edilmiş. Bu sayede SQL sorgularında `$1`, `$2` parametreleri MSSQL'in `@p1`, `@p2` yapısına otomatik dönüştürülüyor.
2.  **Otomatik Güncelleme Mantığı:** Agent exe olarak çalıştığından, güncelleme scripti [updater.js](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/agent/updater.js) geçici bir batch dosyası (`do_update.bat`) oluşturarak çalışan exe'yi durduruyor, yenisiyle değiştiriyor ve Windows Scheduled Task (`OnOffDash_Agent_Service`) üzerinden servisi yeniden başlatıyor.
3.  **Yazıcı Takip Stratejisi:** SNMP (Port 161 UDP) başarısız olduğunda sistem, HP yazıcıların web arayüzünden kazıma (web scraping - Cheerio/Axios) yaparak toner seviyelerini çekmeye çalışıyor.

---

## 6. Önerilen Sonraki Adımlar

*   **`task.md` Güncellemesi:** Tamamlanan özelliklerin durumunu güncellemek adına [task.md](file:///c:/Users/TEST/Desktop/OnOffDash_V2/network-monitor/task.md) dosyasındaki boş kutucuklar `[x]` olarak işaretlenebilir.
*   **Derleme Testi:** Frontend tarafında kod bütünlüğünü doğrulamak için `npm run build` komutu çalıştırılabilir.
*   **Hataların/Eksiklerin Giderilmesi:** Uygulamada test etmek veya geliştirmek istediğiniz spesifik bir alan varsa (örn. bildirim sesleri, grafik tasarımları vb.) üzerinde çalışabiliriz.
