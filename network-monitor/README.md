# OnOffDash V2 - Network Monitor

OnOffDash, ağınızdaki bilgisayarları, sunucuları ve yazıcıları tek bir merkezden izlemenizi sağlayan, Node.js ve React kullanılarak geliştirilmiş modern bir ağ izleme çözümüdür.

## Özellikler

- **Ağ Cihazları İzleme:** Belirlediğiniz cihazların durumunu ping yöntemiyle izler.
- **Agent Entegrasyonu:** Hedef bilgisayarlara kurulan hafif bir "Agent" sayesinde cihazların CPU, RAM, Disk, İşletim Sistemi gibi detaylı verilerini toplar.
- **Yazıcı İzleme:** Ağınızdaki yazıcıları SNMP protokolü veya Web Scraping yöntemiyle otomatik tarayarak; toner seviyelerini, basılan toplam sayfa sayısını ve varsa "Kağıt Sıkışması" gibi hataları raporlar.
- **Gerçek Zamanlı Veri Akışı:** Socket.IO altyapısı sayesinde dashboard sayfasını yenilemeye gerek kalmadan tüm online/offline değişikliklerini ve anlık verileri anında yansıtır.
- **Otomatik Veritabanı:** Kurulum sırasında tabloları otomatik oluşturur.

---

## 📋 Sistem Gereksinimleri

Bu projeyi çalıştırmak için bilgisayarınızda (veya sunucunuzda) aşağıdaki araçların kurulu olması gerekir:

1. **Node.js** (v16.x veya daha yeni bir sürüm) - [İndir](https://nodejs.org/)
2. **PostgreSQL** (v12 veya üstü) - [İndir](https://www.postgresql.org/download/)

---

## 🚀 Hızlı Başlangıç

Projeyi çalıştırmanın **iki** yolu vardır: Docker ile (Önerilen) veya Manuel kurulum ile.

### Yöntem 1: Docker ile Tek Tıkla Kurulum (Önerilen)

Eğer sisteminizde Docker ve Docker Compose yüklüyse, hiçbir bağımlılığa (Node.js, PostgreSQL) ihtiyaç duymadan sistemi saniyeler içinde başlatabilirsiniz.

1. Terminalden projenin kök dizinine (bu README dosyasının bulunduğu klasöre) gidin:
   ```bash
   cd network-monitor
   ```
2. Docker Compose ile tüm servisleri (Veritabanı, Backend, Frontend) arka planda başlatın:
   ```bash
   docker-compose up -d --build
   ```
3. İşlem tamamlandığında, tarayıcınızdan `http://10.0.80.113` (veya `http://localhost`) adresine giderek yönetim paneline erişebilirsiniz.
*(Not: Nginx Reverse Proxy sayesinde 3001 ve 5173 portları tek bir 80 portu altında birleştirilmiştir).*

Sistemi durdurmak isterseniz: `docker-compose down` komutunu kullanabilirsiniz.

---

### Yöntem 2: Manuel Kurulum (Geliştiriciler İçin)

Proje üç ana bileşenden oluşur: **Backend** (Sunucu), **Frontend** (Kullanıcı Arayüzü) ve **Agent** (İzlenecek Windows bilgisayarlara kurulacak servis).

#### 1. Backend (Sunucu) Kurulumu

PostgreSQL veritabanını yönetecek ve tüm sistemi çalıştıracak olan backend'i başlatmak için:

1. Terminali veya PowerShell'i açıp backend klasörüne gidin:
   ```bash
   cd network-monitor/backend
   ```
2. Gerekli kütüphaneleri indirin:
   ```bash
   npm install
   ```
3. Backend klasörünün içerisine `.env` adında bir dosya oluşturup PostgreSQL veritabanı şifrenizi ve sunucu IP'nizi tanımlayın (Örnek `backend/.env` içeriği):
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=network_monitor
   DB_USER=postgres
   DB_PASSWORD=1234  # Kendi veritabanı şifreniz

   SERVER_HOST=10.0.80.113  # Veya localhost (0.0.0.0)
   SERVER_PORT=3001

   PING_INTERVAL_SECONDS=60
   HEARTBEAT_TIMEOUT_SECONDS=90
   ```
4. Backend'i çalıştırın. (İlk çalıştırmada sistem otomatik olarak PostgreSQL'de tabloları oluşturacaktır).
   ```bash
   npm start
   ```
*(Backend çalıştığında: `http://localhost:3001` adresinden API yayınına başlar).*

### 2. Frontend (Kullanıcı Arayüzü) Kurulumu

Yönetim panelini (Dashboard) başlatmak için ayrı bir terminal sekmesi açın:

1. Frontend klasörüne gidin:
   ```bash
   cd network-monitor/frontend
   ```
2. Gerekli paketleri indirin:
   ```bash
   npm install
   ```
3. Eğer backend uygulamanızın IP'si farklıysa `frontend/src/services/api.js` veya `frontend/src/hooks/useSocket.js` içindeki `API_BASE` yollarını veya `package.json`/`vite.config.js` proxy hedeflerini güncelleyin.
4. Geliştirici sunucusunu başlatın:
   ```bash
   npm run dev
   ```
*(Frontend çalıştığında: Tarayıcınızdan `http://localhost:5173` adresine giderek arayüzü görebilirsiniz).*

### 3. Agent (Cihaz İzleme Aracı) Kurulumu

Eğer sadece ping değil, aynı zamanda cihazın donanım bilgilerini (RAM, CPU) görmek istiyorsanız, izlenecek olan her bilgisayara bu Agent'ı kurmalısınız.

1. Agent klasörüne gidin:
   ```bash
   cd network-monitor/agent
   ```
2. Gerekli kütüphaneleri indirin:
   ```bash
   npm install
   ```
3. `.env` dosyasını oluşturup (veya var olanı düzenleyip) sunucunuzun (Backend'in çalıştığı makinenin) IP'sini yazın:
   ```env
   # Backend sunucusunun adresi (Sonunda / olmadan)
   SERVER_URL=http://10.0.80.113:3001
   
   # Agent'ın bilgi gönderme sıklığı (milisaniye)
   HEARTBEAT_INTERVAL=30000
   ```
4. Agent'ı başlatın:
   ```bash
   node start_agent.js
   ```
*(Agent'ı her bilgisayarda Node.js kurmadan kolayca çalıştırmak isterseniz, `npm install -g pkg` ile global olarak pkg kurup, `pkg start_agent.js --targets node18-win-x64 -o NetworkAgent.exe` komutuyla `.exe` haline dönüştürebilirsiniz).*

---

## 🛠️ Sorun Giderme

- **EADDRINUSE (Port Hatası):** Backend'i başlattığınızda "address already in use 3001" veya Frontend için "port 5173" hataları alıyorsanız, o portu kullanan önceki işlemler kapanmamış demektir. Görev yöneticisinden `Node.js` süreçlerini sonlandırın ve tekrar deneyin.
- **Yazıcılar Otomatik Güncellenmiyor:** Backend SNMP (Port 161 UDP) kullanarak yazıcı verilerini çeker. Yazıcılarda SNMP erişiminin aktif (`public` komünitesi ile) olduğundan emin olun. Cihazınız SNMP desteklemiyorsa sistem Web Scraper yöntemine geçerek sayfayı kazımayı (özellikle HP'ler için) dener.
- **Veritabanı Hataları (SCRAM-SERVER-FIRST-MESSAGE):** `.env` dosyasındaki `DB_PASSWORD` ile yerel makinenizdeki PostgreSQL şifrenizin (örneğin pgAdmin ile girdiğiniz şifrenin) birebir eşleştiğinden emin olun.
