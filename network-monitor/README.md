# OnOffDash V2 — Network & Device Monitoring Platform

OnOffDash V2, kurumsal yerel ağlardaki bilgisayarları, sunucuları, yazıcıları tek merkezden izleyen; donanım ve yazılım envanterini çıkaran; PDF ve dosya işleme araçları sunan güvenli, modüler ve modern bir yönetim platformudur.

---

## 🏛️ Mimari ve Bileşenler

| Bileşen | Teknoloji | Görev / İşlev |
|---|---|---|
| **Frontend** | React 19, Vite 8, Lucide Icons, Recharts | Kullanıcı arayüzü, cihaz/yazıcı/envanter/bakım panelleri, PDF ve dosya araçları |
| **Backend** | Node.js (Express), Socket.IO, net-snmp, ping | Cihaz ping taraması, SNMP yazıcı sorguları, Agent API, REST API, RBAC |
| **Veritabanı** | Microsoft SQL Server (MSSQL 2022 / Express) | Cihazlar, yazıcılar, durum geçmişi, heartbeat, kullanıcılar, bakım kayıtları |
| **PDF Service** | Python 3 (FastAPI, PyMuPDF, PyPDF, Pillow) | PDF önizleme, birleştirme, bölme, sayfa sıralama, sıkıştırma, filigran |
| **File Service** | Python 3 (FastAPI, Pillow, Charset-Normalizer) | Görsel dönüştürme/yeniden boyutlandırma, CSV onarımı, metin kodlama, ZIP |
| **Windows Agent** | Node.js (systeminformation, axios, ws) | Windows cihazlarında arka plan CPU/RAM/Uptime/Yazılım envanteri bildirimi |
| **Reverse Proxy** | Nginx (Frontend Container) | Tek giriş kapısı (Port 80); `/api/`, `/api/pdf/`, `/api/file-tools/`, `/socket.io/` yönlendirme |

---

## 🔒 Güvenlik Mimarisi

1. **JWT Kimlik Doğrulama:**
   - En az 32 karakter uzunluğunda `JWT_SECRET` zorunludur.
   - Oturum anahtarları yalnızca `Authorization: Bearer <token>` başlığında taşınır; URL sorgu parametreleri (`?token=...`) log ve tarayıcı geçmişi sızıntısını önlemek için reddedilir.
   - Socket.IO bağlantıları JWT handshake middleware ile doğrulanır.
2. **Ajan Kimlik Doğrulama (`X-Agent-Key`):**
   - Agent ile Backend arasındaki iletişim `crypto.timingSafeEqual` ile zamanlama saldırılarına karşı korumalı `AGENT_API_KEY` üzerinden yürütülür.
   - Agent yazılım envanteri ve heartbeat uç noktaları bağımsız olarak korunur.
3. **Rol Tabanlı Yetkilendirme (RBAC):**
   - `admin`: Tam yetki (cihaz silme, kullanıcı yönetimi, veritabanı operasyonları).
   - `operator`: Cihaz/yazıcı ekleme, güncelleme, bakım durumu işaretleme, Excel içe aktarma.
   - `viewer`: Salt okunur erişim (dashboard, filtreleme, arama).
4. **Excel Formül Enjeksiyonu Koruması (CWE-1236):**
   - Tüm Excel dışa aktarım uç noktaları (`=`, `+`, `-`, `@`, `\t`, `\r`) ile başlayan hücre değerlerini otomatik olarak `'` ile kaçırarak korur.
5. **Ajan Güncelleme Bütünlüğü (SHA-256):**
   - Güncellemelerde SHA-256 sağlama toplamı ve dosya boyutu doğrulaması yapılır; başarısız olursa `.bak` dosyasından otomatik geri alma (rollback) çalışır.
6. **Container İzolasyonu:**
   - Veritabanı ve backend servis portları host'a açık değildir. Dış dünyaya yalnızca Nginx (Port 80) açıktır.

---

## 📋 Sistem Gereksinimleri

- **Docker Kurulumu için:** Docker 24+ ve Docker Compose v2+
- **Manuel Kurulum için:**
  - Node.js 20.x veya üzeri
  - Microsoft SQL Server 2019 / 2022 / Express (Port: 1433)
  - Python 3.10+ (PDF ve dosya mikroservisleri için)

---

## 🚀 Hızlı Başlangıç (Docker ile Kurulum — Önerilen)

1. Deponun kök dizininde veya `network-monitor` dizininde ortam değişkenlerini ayarlayın:
   ```bash
   cd network-monitor
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```
2. `.env` dosyası içinde `MSSQL_SA_PASSWORD`, `JWT_SECRET` (en az 32 karakter) ve `AGENT_API_KEY` (en az 32 karakter) değerlerini güvenli şifrelerle doldurun.
3. Servisleri derleyip başlatın:
   ```bash
   docker compose up -d --build
   ```
4. Tarayıcınızdan `http://localhost` adresine giderek platforma erişin.
   - Varsayılan bootstrap yönetici hesabı: İlk açılışta `BOOTSTRAP_ADMIN_USERNAME` ve `BOOTSTRAP_ADMIN_PASSWORD` ortam değişkenlerinden otomatik oluşturulur.

> **Geliştirici İpucu:** Eğer yerel geliştirme sırasında container portlarını doğrudan host makinenize bağlamak isterseniz:
> `cp docker-compose.override.yml.example docker-compose.override.yml`

Durdurmak için: `docker compose down`

---

## 🛠️ Manuel Kurulum (Geliştiriciler İçin)

### 1. Backend Kurulumu

```bash
cd network-monitor/backend
npm install
cp .env.example .env
# .env dosyasında DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET, AGENT_API_KEY ayarlayın

npm test     # 20 adet otomatik test çalıştırılır
npm start    # Sunucu Port 3001'de başlar
```

### 2. Frontend Kurulumu

```bash
cd network-monitor/frontend
npm install
npm run dev  # Vite geliştirici sunucusu Port 5173'te açılır
# Üretim paketi derlemek için: npm run build
```

### 3. Mikroservisler (PDF & Dosya Araçları)

```bash
# PDF Servisi
cd network-monitor/services/pdf-service
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001

# Dosya Araçları Servisi
cd network-monitor/services/file-service
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8002
```

### 4. Windows Agent Kurulumu

İzlenecek Windows bilgisayarlarda:
```bash
cd network-monitor/agent
npm install
cp .env.example .env
# .env dosyası:
# SERVER_URL=http://<SUNUCU_IP_VEYA_HOST>:3001
# AGENT_API_KEY=<BACKENDTEKI_ILE_AYNI_KEY>
# HEARTBEAT_INTERVAL=30000

node agent.js
```
Executable derlemek için:
```bash
npm run build:exe
```

---

## 🧪 Test ve Doğrulama

Tüm testleri çalıştırmak için:

```bash
# Backend Testleri (Node test runner)
cd network-monitor/backend
npm test

# Python PDF Servisi Testleri
cd network-monitor/services/pdf-service
python3 -m unittest discover -s tests -p "test_*.py"

# Python Dosya Servisi Testleri
cd network-monitor/services/file-service
python3 -m unittest discover -s tests -p "test_*.py"

# Frontend Derleme Testi
cd network-monitor/frontend
npm run build
```

---

## 📄 Lisans ve Destek

Bu proje kurumsal ağ izleme ve envanter yönetimi amacıyla geliştirilmiştir.
Güvenlik bildirimleri ve secret rotasyonu için lütfen `SECURITY_MIGRATION.md` ve `SECURITY.md` dosyalarını inceleyin.
