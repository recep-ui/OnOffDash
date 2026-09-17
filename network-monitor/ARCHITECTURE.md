# Architecture: OnOffDash V2

Bu doküman, OnOffDash V2 projesinin yazılım mimarisini, veri akışını, bileşenlerin sorumluluklarını ve konfigürasyon detaylarını açıklamaktadır.

## Sistem Bileşenleri Dağılımı

Sistem, Docker Compose vasıtasıyla tek bir çatı altında koordine edilen 5 ana servisten ve izlenen bilgisayarlarda çalışan 1 bağımsız istemciden oluşur:

### 1. Database (db)
* **Teknoloji:** Microsoft SQL Server 2022 Express.
* **Görevi:** Cihazların, yazıcıların, tonerlerin, bakım verilerinin, yazılım envanterinin ve kullanıcı bilgilerinin kalıcı olarak saklanması.
* **Port:** `1433` (İç ve dış erişim).

### 2. Backend (backend)
* **Teknoloji:** Node.js, Express.js, Socket.IO, node-cron.
* **Görevi:** 
  * Express API üzerinden frontend ve agent taleplerini karşılamak.
  * `PingService` ile ağdaki IP'leri periyodik kontrol etmek.
  * `PrinterMonitorService` ile SNMP ve cheerio fallback scraper kullanarak yazıcıları taramak.
  * Canlı değişiklikleri Socket.IO ile anlık istemcilere iletmek.
  * Ajan versiyonlarını (`agent_version.json`) ve güncellemelerini yönetmek.
* **Port:** `3001` (Docker içinde çalışır, dışarıya Nginx üzerinden açılır).

### 3. Frontend (frontend)
* **Teknoloji:** React (Vite), Socket.IO Client, Recharts, Nginx.
* **Görevi:** 
  * Kullanıcı yönetim panelini glassmorphic tasarımla sunmak.
  * Nginx web sunucusu üzerinden statik dosyaları dağıtmak.
  * Nginx reverse proxy ayarları (`frontend/nginx.conf`) ile `/api/`, `/api/pdf/`, `/api/file-tools/` ve `/socket.io/` isteklerini doğru servislere yönlendirmek.
* **Port:** `80` (Dış dünyaya açılan tek port).

### 4. PDF Service (pdf-service)
* **Teknoloji:** Python (FastAPI), PyPDF, PyMuPDF (Fitz), PyMSSQL.
* **Görevi:** PDF birleştirme, bölme, sayfaları döndürme/düzenleme, sıkıştırma ve filigran ekleme işlemlerini gerçekleştirmek.
* **Port:** `8001` (Docker içinde çalışır, Nginx `/api/pdf/` üzerinden erişilir).

### 5. File Service (file-service)
* **Teknoloji:** Python (FastAPI), Pillow, PyMSSQL.
* **Görevi:** Resim boyutlandırma/dönüştürme, CSV bozuk karakter düzeltme, encoding transcodeları, toplu isimlendirme ve sıkıştırma (ZIP).
* **Port:** `8002` (Docker içinde çalışır, Nginx `/api/file-tools/` üzerinden erişilir).

### 6. Agent (Windows Client)
* **Teknoloji:** Node.js, systeminformation, Node-fetch, pkg.
* **Görevi:** Donanım metriklerini, işletim sistemini, anakart ve kurulu yazılım envanterini toplayarak arka planda HTTP POST istekleri ile Backend sunucusuna iletmek.

---

## Detaylı Mimarisi ve Veri Akışı

Aşağıdaki şemada, bileşenlerin birbirleriyle olan ilişkileri ve veri alışveriş yönleri görülmektedir:

```
                  +----------------------------------------------+
                  |                 USER BROWSER                 |
                  +----------------------------------------------+
                                         |
                                (HTTP / Web Socket)
                                         v
                  +----------------------------------------------+
                  |               nginx (Port 80)                |
                  +----------------------------------------------+
                     /                   |                    \
        (Proxy to 3001)           (Proxy to 8001)        (Proxy to 8002)
             /                           |                      \
            v                            v                       v
   +------------------+         +------------------+    +------------------+
   |  Express Server  |         |   pdf-service    |    |   file-service   |
   |   (Port 3001)    |         |   (Port 8001)    |    |   (Port 8002)    |
   +------------------+         +------------------+    +------------------+
     |       ^       \                    |                      |
  (Ping)  (Push)      \                   |                      |
     |    Telemetry    \                  |                      |
     v       |          v                 v                      v
  [LAN]    [Agent]     +--------------------------------------------+
  Device    Windows    |          SQL SERVER (Port 1433)            |
  & Printer  Client    |         Database: network_monitor          |
                       +--------------------------------------------+
```

---

## Teyit Edilmesi Gereken Hususlar ("Teyit Edilmeli")
- [ ] **FastAPI Loglama Modu:** `pdf-service` ve `file-service` mikroservislerinin loglama modları (`PDF_LOG_MODE` ve `FILE_TOOLS_LOG_MODE`) Docker Compose dosyasında `jsonl` olarak set edilmiştir. Eğer veritabanı loglamasına geçilecekse (`database`), `pdf_jobs` ve `file_jobs` tablolarının migration durumları ve MSSQL veritabanı şemasına etkileri teyit edilmelidir.
- [ ] **Docker Compose Sabit IP Adresleri:** Docker Compose içerisindeki `CORS_ORIGINS` ve `SERVER_URL` gibi parametreler lokal test IP'sine (`10.0.80.113` vb.) göre düzenlenmiştir. Production ortamına geçişte bu IP'lerin alan adı (domain) veya ortam değişkenleriyle dinamik hale getirilmesi teyit edilmelidir.
