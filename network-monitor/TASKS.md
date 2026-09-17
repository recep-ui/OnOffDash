# Tasks: OnOffDash V2 Roadmap

Bu dokümanda OnOffDash V2 projesinin mevcut durumdan güvenli çalışmaya ve yeni özelliklerin entegrasyonuna uzanan 5 aşamalı yol haritası listelenmiştir.

## Aşamalar ve Görev Listesi

### Aşama 1: Proje Hafızasının ve Durumunun Netleştirilmesi
- [x] Workspace dizin yapısının ve kodların analiz edilmesi.
- [x] Projenin ana amaçlarının, mimarisinin ve teknoloji yığınının dokümante edilmesi (`PROJECT_CONTEXT.md` ve `ARCHITECTURE.md`).
- [x] Geliştirme kurallarının ve standartlarının belirlenmesi (`DEVELOPMENT_RULES.md`).
- [x] Mevcut durum analiz raporu ile IT ajanı günlüklerinin hazırlanması (`CHANGELOG_AGENT.md`).

### Aşama 2: Lokal Çalıştırma ve Çevre Kontrolleri
- [ ] Docker ve Docker Compose ortamının kontrol edilmesi.
- [ ] `docker-compose up -d --build` komutu ile tüm servislerin (DB, Express, React, PDF ve File tools) yerel makinede ayağa kaldırılması.
- [ ] SQL Server Express konteynerinin ayağa kalkışında migrations scriptinin (`db/migrations.js`) sorunsuz çalıştığının ve güvenli bootstrap admin kullanıcısının (`BOOTSTRAP_ADMIN_USERNAME`) veritabanına eklendiğinin teyit edilmesi.
- [ ] Arayüzün Nginx üzerinden port 80'de düzgün servis edildiğinin doğrulanması.

### Aşama 3: Eksikliklerin Giderilmesi ve Güvenlik Sıkılaştırma
- [ ] **FastAPI JWT İmza Kontrolü:** `pdf-service` ve `file-service` Python servislerine imza doğrulamalı (JWT_SECRET kullanan) JWT validator eklenmesi.
- [ ] **Şablon Yapılandırmaları (.env.example):** Kök dizin, `backend/` ve `agent/` klasörleri altına şablon `.env.example` dosyalarının yerleştirilmesi.
- [ ] **IP Adreslerinin Dinamikleştirilmesi:** Docker Compose ve Agent dosyalarındaki sabit IP adreslerinin (`10.0.80.113`, `10.0.80.110`) kaldırılarak ortam değişkenlerine (environment variables) bağlanması.

### Aşama 4: Hata Ayıklama ve Küçük Düzeltmeler
- [ ] **SQL Query Testleri:** Express sunucu loglarının takip edilerek PG wrapper (`connection.js`) üzerinden dönüştürülen sorgularda SQL Server hata çıktıları verip vermediğinin doğrulanması.
- [ ] **Excel İçe Aktarım Validasyonu:** Excel yükleme fonksiyonunun (`import_excel.js`) hatalı şablon yüklemelerine karşı toleransının artırılması ve frontend arayüzünde hata mesajlarının iyileştirilmesi.
- [ ] **Agent Güncelleme Kararlılığı:** `do_update.bat` scriptinin Windows SYSTEM yetkileriyle çalışırken yarıda kalma risklerine karşı hata yönetim mekanizmasının test edilmesi.

### Aşama 5: Yeni Özellik Geliştirme ve İyileştirmeler
- [ ] Düşük toner uyarı yüzdesinin (şu an sabit %10) veritabanı ayarlarından veya `.env` üzerinden özelleştirilebilir hale getirilmesi.
- [ ] Cihaz arayüzünde çoklu arama, departman bazlı toplu güncelleme ve Excel dışa aktarım özelliklerinin genişletilmesi.
- [ ] PDF ve Dosya işlemleri için yükleme limitlerinin ve log sürelerinin admin paneli üzerinden görüntülenebilmesi.

---

## Teyit Edilmesi Gereken Hususlar ("Teyit Edilmeli")
- [ ] **Test Sunucusu ve Canlı Ortam Bilgileri:** Bu aşamaların hangi test makinesinde veya staging ortamında koşturulacağı teyit edilmelidir.
- [ ] **Ajan Derleme Yöntemi:** Agent exe'sinin hangi Node.js versiyonu ile pkg üzerinde derleneceği ve Windows 10/11 uyumluluğu teyit edilmelidir.
