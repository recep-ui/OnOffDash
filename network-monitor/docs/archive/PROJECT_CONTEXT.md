# Project Context: OnOffDash V2

OnOffDash V2, ağdaki tüm cihazları (PC, sunucu, yazıcı vb.) tek bir merkezden izlemek, yönetmek ve donanım/yazılım envanterini toplamak amacıyla geliştirilmiş web tabanlı bir ağ izleme ve BT operasyon yönetim paneli uygulamasıdır.

## Projenin Amacı ve Hedefi
Bu proje; bilgi işlem departmanlarının ağdaki cihazların durumunu (çevrimiçi/çevrimdışı/uyarı) anlık olarak takip etmesini, donanım kaynaklarını ve kurulu yazılımları merkezi bir arayüzden sorgulayabilmesini, yazıcı toner seviyelerini ve kağıt sıkışma hatalarını izleyerek kritik durumlarda tarayıcı üzerinden sesli ve görsel bildirimler alabilmesini hedefler. Ayrıca IT operasyon günlükleri, bakım takvimleri ve malzeme akışı gibi süreçler de sistem üzerinden takip edilir.

## Genel Yapı ve Çalışma Şekli
Sistem, üç ana bileşenden ve iki bağımsız yardımcı mikroservisten oluşmaktadır:
1. **Ağ İzleme Sunucusu (Express Backend):** Ağ cihazlarına periyodik ICMP ping atar ve durum değişikliklerini istemcilere Socket.IO aracılığıyla anlık olarak bildirir. Ağ yazıcılarını SNMP protokolü (veya fallback olarak HTTP scraping) ile tarayarak toner ve hata durumlarını toplar.
2. **Kullanıcı Arayüzü (React Frontend):** Vite ve React ile geliştirilmiş, Socket.IO istemcisi ile anlık verileri alan ve Recharts grafik kütüphanesiyle donanım trendlerini çizen modern bir yönetim panelidir.
3. **Windows Ajanı (Agent Client):** Windows işletim sistemine sahip cihazlarda arka planda Windows Scheduled Task (SYSTEM kullanıcısı) olarak çalışır. 30 saniyede bir heartbeat ile sunucuya donanım metriklerini, 6 saatte bir ise yüklü Windows yazılımları envanterini gönderir. Kendi kendini arka planda otomatik güncelleyebilme yeteneğine sahiptir.
4. **FastAPI Mikroservisleri:** Ağ izleme sisteminden bağımsız olarak çalışan; PDF birleştirme/bölme/sıkıştırma/filigranlama işlerini yürüten `pdf-service` ve resim manipülasyonu/CSV karakter düzeltme/zipping/toplu isimlendirme işlerini yürüten `file-service` yardımcı servisleridir.

---

## Teyit Edilmesi Gereken Hususlar ("Teyit Edilmeli")
Projede mevcut durum analizine göre kesin olarak netleştirilmesi gereken noktalar:
- [ ] **SQL Server ve PostgreSQL Uyum Wrapper'ı:** `backend/db/connection.js` içerisindeki `$1, $2` -> `@p1, @p2` dönüştürücüsünün MSSQL tarafında oluşturduğu sorguların, özellikle tarih farkı (`DATEADD`) ve `COALESCE` fonksiyonlarında bir uyumsuzluğa neden olup olmadığı test ortamında teyit edilmelidir.
- [ ] **Gerçek Ağ Ortamı ve SNMP:** Yazıcıların SNMP (Port 161 UDP, "public" community) erişimlerinin gerçek ağda açık olup olmadığı ve HP yazıcılar için kullanılan fallback web kazıma linklerinin hedef yazıcı modellerinin güncel firmware sürümleriyle uyumluluğu teyit edilmelidir.
- [ ] **Ajan Kurulumu Yetkileri:** Agent'ın Windows makinelere kurulmasını sağlayan `install_agent.bat` scriptinin, kısıtlı kullanıcı yetkilerine sahip Active Directory etki alanındaki bilgisayarlarda başarıyla SYSTEM görevi oluşturup oluşturamayacağı teyit edilmelidir.
- [ ] **Veritabanı Log Retention Süresi:** Donanım verilerinin 30 gün boyunca biriktirilmesinin (`RETENTION_DAYS=30`), SQL Server Express veri tabanı dosya sınırı olan 10GB limitini ne kadar sürede zorlayacağı veya performans kaybına sebep olup olmayacağı teyit edilmelidir.
