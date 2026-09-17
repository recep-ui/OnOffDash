# Development Rules: OnOffDash V2

Bu doküman, OnOffDash V2 projesinde kod yazarken, hata ayıklarken ve yeni özellik eklerken uyulması gereken standartları ve kuralları içerir.

## 1. Veritabanı ve Sorgu Standartları
* **PostgreSQL Parametrik Sorguları:** Backend veritabanı sorguları yazılırken PostgreSQL stili binding (`$1, $2, $3`) kullanılmalıdır. 
* **MSSQL Uyumluluğu:** Alt yapıda SQL Server (MSSQL) çalıştığı için SQL fonksiyonları ve veritabanı veri tipleri SQL Server'a göre yazılmalıdır (Örneğin: `NOW()` yerine `GETDATE()` veya `GETDATE()` yerine `DATETIME2`).
* **Sorgu Dönüştürücü Sınırları:** Sorgu dönüştürücü `db/connection.js` regex ile basit bir değiştirme yapar. Karmaşık PostgreSQL sorguları (örn. postgres'e özel string fonksiyonları, json işlemleri veya karmaşık join syntax'leri) MSSQL tarafında hata verecektir. SQL Server standartlarına uygun, sade sorgular tercih edilmelidir.

## 2. Gerçek Zamanlı (Socket.IO) Akış Kuralları
* Arayüzün yenilenmesine gerek kalmadan verilerin güncellenmesi projenin en kritik özelliklerindendir.
* Veritabanında bir cihazın durumu (`status`), yazıcının çevrimiçi bilgisi (`is_online`), toner doluluğu veya kağıt sıkışma hatası güncellendiğinde; ilgili backend servisinden (`pingService.js` veya `printerMonitorService.js`) soket eventleri tetiklenmelidir:
  * Cihaz güncellemelerinde: `device:updated` ve `device:statusChanged`
  * Yazıcı güncellemelerinde: `printer:updated`, `toner:low` ve `printer:jam`
  * İstatistik güncellemelerinde: `dashboard:stats`

## 3. Ajan ve Sürüm Kontrolü Kuralları
* Windows Ajanı bağımsız bir executable (`.exe`) haline getirilmek üzere `pkg` paketiyle derlenmektedir.
* Ajan güncellemeleri backend tarafındaki `agent_version.json` dosyasından takip edilir. Agent versiyonu yükseltildiğinde bu dosyadaki versiyon güncellenmeli ve yeni derlenen exe backend'de ilgili klasöre yerleştirilmelidir.
* Agent kodu içerisine eklenecek yeni paketler Windows işletim sistemi üzerinde `pkg` derlemesini bozmayacak şekilde seçilmelidir.

## 4. Mikroservis ve Proxy Kuralları
* Frontend, Backend ve yardımcı Python servisleri arasındaki tüm iletişim `nginx.conf` üzerinden dağıtılır.
* Frontend'den yapılacak isteklerde asla doğrudan `localhost:3001` veya `localhost:8001` port adresleri kodlanmamalıdır. 
* İstekler daima Nginx reverse proxy yolları üzerinden yapılmalıdır:
  * Express API: `/api/...`
  * PDF Servisi API: `/api/pdf/...`
  * Dosya Servisi API: `/api/file-tools/...`
  * Socket.IO: `/socket.io/...`

## 5. Değişiklik Yönetimi ve Raporlama
* Kodda değişiklik yapmadan veya yeni bir kütüphane eklemeden önce mutlaka analiz yapılmalıdır.
* Projedeki hassas veriler (.env, API şifreleri, JWT secret'ları vb.) kesinlikle kod içerisine açık metin olarak yazılmamalıdır.

---

## Teyit Edilmesi Gereken Hususlar ("Teyit Edilmeli")
- [ ] **Büyük Sorguların Performansı:** Veritabanındaki `heartbeats` ve `device_status_logs` tabloları çok hızlı büyümektedir. Gelecekte yazılacak analiz ve analitik sorgularının SQL Server indekslerini doğru kullanıp kullanmadığı teyit edilmelidir.
- [ ] **Python Servis JWT Validasyonu:** Mikroservislere gönderilen JWT token'larının imza doğrulaması FastAPI tarafında yapılmamaktadır. Geliştirme kurallarına gelecekte "Python servislerinde JWT token doğrulaması zorunludur" maddesinin eklenip eklenmeyeceği teyit edilmelidir.
