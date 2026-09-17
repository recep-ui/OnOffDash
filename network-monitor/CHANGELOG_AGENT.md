# Agent Changelog: OnOffDash V2 Memory

Bu dosya, projeye geri dönüş tarihimiz itibariyle yapılan analizleri, sistem durumunu, eksiklikleri ve atılacak sonraki adımları kayıt altında tutmak için hazırlanmıştır.

## 1. Projeye Geri Dönüş Tarihi
* **Tarih:** 18 Haziran 2026

## 2. Agent Analiz Özeti
Yapay zeka ajanı tarafından yapılan kod analizi, projenin tamamen MSSQL veri tabanına göç ettiğini, ancak PostgreSQL uyumlu sorgu yapısı kullanmaya devam ettiğini doğrulamıştır. Projedeki tüm 5 yeni özellik (Bildirim Sistemi, Toner Pulse Animasyonlu Badge, Recharts Grafik Detay Modalı, Ajan Otomatik Güncelleme ve Kapsamlı Yazılım Envanteri) kod seviyesinde entegre edilmiş ve tamamlanmıştır. Ajan ayrıca Python ile yazılmış bağımsız `pdf-service` ve `file-service` mikroservislerinin de projeye sorunsuz dahil edildiğini doğrulamıştır.

## 3. Tespit Edilen Mevcut Durum
* **Veritabanı Yapısı:** `db/migrations.js` içerisindeki tüm veri tabloları SQL Server Express üzerinde sorunsuz oluşturulmaktadır. Default `admin` / `admin123` kullanıcısı otomatik oluşturulur.
* **Ağ İzleme:** Cihazların ping durumları periyodik sorgulanmakta ve `PingService` üzerinden Socket.IO ile canlı yayınlanmaktadır.
* **Yazıcı İzleme:** SNMP ve fall-back HTML kazıma yöntemleri çalışmaktadır. Toner seviyeleri ve kağıt sıkışma logları veritabanında tutulmaktadır.
* **Ajan Telemetrisi:** Windows ajan yazılımı PowerShell ve Registry sorguları yardımıyla Store/Registry yazılım listesini ve donanım kullanım verilerini Express API'ye gönderebilmektedir.
* **Mikroservisler:** PDF ve File FastAPI servisleri Nginx yönlendirmeleriyle dosya yükleme, işleme ve indirme taleplerini yerine getirmektedir.

## 4. Eksik Görülen Alanlar
* **JWT Token Güvenliği:** Python FastAPI mikroservislerinde JWT imzalarının doğrulanmaması (yalnızca payload decode edilmesi).
* **Sabit IP Yapılandırması (Hardcoded IPs):** Docker Compose ve Agent konfigürasyonlarında lokal IP adreslerinin (`10.0.80.113` ve `10.0.80.110`) sabit olarak tanımlanması.
* **Eksik Şablonlar:** Proje genelinde ve alt servislerde `.env.example` dosyalarının bulunmaması.
* **Dökümantasyon Boşluğu:** Projede `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `DEVELOPMENT_RULES.md` ve `TASKS.md` dosyalarının eksik olması (bu güncellenme ile hepsi oluşturulmuştur).

## 5. Sonraki Önerilen Görevler
1. Projenin Docker üzerinde lokal olarak ayağa kaldırılması ve DB migrations testlerinin doğrulanması (`docker-compose up -d --build`).
2. Python FastAPI servisleri için JWT imza doğrulaması implementasyonunun yapılması.
3. IP adresleri ve anahtarların çevre değişkenleri (`.env`) vasıtasıyla dinamikleştirilmesi.
4. Ağ yazıcılarının SNMP tarama testi ve HP fallback scraper arayüz uyumluluk kontrolleri.
5. Windows makinede test ajanı kurularak otomatik güncelleyici bat scriptinin ve scheduled task akışının canlı doğrulaması.

---

## Teyit Edilmesi Gereken Hususlar ("Teyit Edilmeli")
- [ ] **Python Servis Veritabanı Logger'ı:** `logger.py` içindeki database logging modunun çalışabilmesi için `pdf_jobs` ve `file_jobs` tablolarının backend ana migrations dosyasına mı ekleneceği yoksa Python servislerinin kendi startup'ında mı oluşturulacağı teyit edilmelidir.
- [ ] **Ajan Paket Boyutu ve Dağıtımı:** Ajanın `pkg` ile paketlenmesi sonrasında oluşan `.exe` dosya boyutunun (~39.7 MB) ve dağıtım yönteminin active directory politikalarına uygunluğu teyit edilmelidir.
