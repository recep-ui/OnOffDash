# OnOffDash V2 — Enterprise IT Operations Dashboard UI/UX Yeniden Tasarım Dokümantasyonu

## 1. Genel Bakış ve Tasarım Felsefesi

OnOffDash V2 projesinin tüm arayüzü, modern **Enterprise IT Operations / Management Dashboard** standartlarına uygun olarak sıfırdan yeniden tasarlanmıştır.

Eski koyu/karmaşık glassmorphism teması yerine; ferah, profesyonel, yüksek kontrastlı, bilgi yoğunluğu optimize edilmiş kurumsal bir **Light Enterprise Theme** (`#F8FAFC` arka plan, `#FFFFFF` kartlar, `#2563EB` kurumsal mavi vurgu, `#0F172A` tipografi) uygulanmıştır.

---

## 2. Tasarım Sistemi & Token Mimarisi

### Renk Paleti (`tokens.css` & `index.css`)
- **Primary / Brand:** `#2563EB` (Hover: `#1D4ED8`, Light Bg: `#EFF6FF`, Border: `#BFDBFE`)
- **App Background:** `#F8FAFC` (Nötr, gözü yormayan açık gri/mavi zemin)
- **Card Background:** `#FFFFFF` (Borders: `#E2E8F0`, Sub-card: `#F8FAFC`)
- **Typography:** Inter, -apple-system, system-ui
  - Primary Text: `#0F172A` (Slate 900)
  - Secondary Text: `#475569` (Slate 600)
  - Muted Text: `#94A3B8` (Slate 400)
- **Status Pills & Alerts:**
  - Online / Sağlıklı: `#10B981` (Bg: `#ECFDF5`, Border: `#A7F3D0`)
  - Offline / Kritik: `#EF4444` (Bg: `#FEF2F2`, Border: `#FECACA`)
  - Warning / Bekleyen: `#F59E0B` (Bg: `#FFFBEB`, Border: `#FDE68A`)
  - Info / Bilgi: `#06B6D4` (Bg: `#ECFEFF`, Border: `#A5F3FC`)

### Gölgelendirme & Kenar Yuvarlama (Radii & Elevation)
- **Card Radius:** `12px`
- **Input & Button Radius:** `8px`
- **Pills / Badges Radius:** `9999px`
- **Elevation:** Hafif, doğal gölgeler (`0 1px 3px 0 rgba(0, 0, 0, 0.05)`, popover'lar için `0 10px 15px -3px rgba(0,0,0,0.08)`)

---

## 3. Yeniden Tasarlanan Sayfalar ve Bileşenler

### A. Layout & Kabuk (Shell)
1. **`AppShell.jsx`**: Master layout bileşeni; Sidebar, Topbar, Global Search modalı ve sayfa içerik alanını entegre eder.
2. **`Sidebar.jsx`**:
   - Sol sabit menü, OnOffDash V2 kurumsal logosu ve "Enterprise IT Operations Monitor" alt başlığı.
   - "ANA MENÜ" ve "KISAYOLLAR" grup başlıkları.
   - Aktif sekme için açık mavi dolgu (`#EFF6FF`) + sol dikey mavi çizgi.
   - Alt kısımda %99.98 SLA garanti tanıtım kartı ve menü daraltma/genişletme butonu.
3. **`Topbar.jsx`**:
   - 64px sabit üst çubuk.
   - `⌘K` / `Ctrl+K` Global Hızlı Arama tetikleyicisi.
   - Canlı Socket.IO bağlantı durumu göstergesi (`● Canlı Bağlantı`).
   - Bildirimler çekmecesi / popover'ı (okunmamış sayaç rozeti ile).
   - Yardım & Dokümantasyon modalı.
   - Kullanıcı profili avatarı ve çıkış yap dropdown menüsü.
4. **`GlobalSearchModal.jsx`**:
   - Tüm cihazlar ve yazıcılar arasında anında filtreleme, IP / Hostname / Departman araması ve tek tıkla detay açma.

---

### B. Dashboard & Genel Bakış
1. **`DashboardOverview.jsx`**:
   - **6 Metrik Kartı:** Toplam Cihazlar, Çevrimiçi Cihazlar, Çevrimdışı Alarmlar, Toplam Ağ Yazıcısı, Açık İş Emirleri, Ortalama Ağ Gecikmesi (SVG sparkline eğrileri ve trend yüzdeleri ile).
   - **Dikkat Gerektiren Cihazlar Tablosu:** Çevrimdışı ve alarm durumundaki cihazların anlık listesi.
   - **Yazıcı Altyapı Durumu:** Düşük toner seviyeleri ve kağıt sıkışma uyarı kartı.
   - **Ağ Sağlığı & Kaynak Dağılımı:** Recharts donut grafiği (Online/Offline/Warning dağılımı).
   - **Son Sistem Olayları:** Canlı olay akışı (bağlantı koptu/geldi, donanım değişimleri).
   - **Hızlı Erişim Grid:** Yeni cihaz, yeni yazıcı, ağ taraması, raporlar ve IPAM hızlı butonları.

---

### C. Cihaz Yönetimi (Devices)
1. **`DeviceTable.jsx`**:
   - Üst özet metrikleri (Toplam, Online, Offline, Alarmlı).
   - Canlı arama kutusu, Departman filtresi, Durum filtresi.
   - Excel İçe Aktar / Dışa Aktar aksiyonları.
   - CPU / RAM mini ilerleme çubukları.
   - Tıklanabilir satırlar ve hızlı aksiyon butonları (Düzenle, Sil).
2. **`DeviceModal.jsx`**:
   - Kurumsal modal yapısı, zorunlu alan etiketleri, IP/Hostname/Departman/Konum/Cihaz Türü alanları.
3. **`DeviceDetailModal.jsx`**:
   - 5 sekmeli kapsamlı cihaz inceleme penceresi:
     1. **Genel Bakış:** Canlı durum, anlık CPU & RAM göstergeleri, sistem uptime, donanım özellikleri, ping gecikme geçmişi (Recharts AreaChart).
     2. **Yazılımlar:** Arama çubuğu, yazılım adı, sürüm ve yüklenme tarihi tablosu.
     3. **Donanım:** İşlemci, RAM, disk, anakart ve GPU düzenleme formu.
     4. **Bakım:** 12 aylık periyodik bakım durum matrisi ve hızlı tamamlama butonları.
     5. **İşlemler:** Cihaza ait servis ve işlem log geçmişi.

---

### D. Yazıcı & Toner Yönetimi (Printers)
1. **`PrinterTable.jsx`**:
   - SNMP toner seviyeleri (Siyah, Mavi, Kırmızı, Sarı) progress çubukları ve yüzde göstergeleri.
   - Kağıt sıkışması uyarı rozetleri.
   - Ağ Taraması tetikleme ve Excel import/export.
2. **`PrinterModal.jsx` & `PrinterDetailModal.jsx`**:
   - Yazıcı ekleme/düzenleme, dinamik toner renk ve kapasite tanımları.
   - Canlı SNMP durum kartı, toplam sayfa sayacı, toner doluluk seviyeleri.
3. **`TonerStockPanel.jsx`**:
   - Model bazlı toner stok envanteri, kritik stok uyarıları (`<= 2` adet).
   - Son toner değişim geçmişi tablosu ve değişim kayıt modalı.

---

### E. IP Yönetimi & Ağ Haritası (IPAM)
1. **`IpamPanel.jsx`**:
   - Aktif subnet sekmeleri ve doluluk oranları.
   - **254 IP İnteraktif Haritası:** Renk kodlu butonlar (Boş, Dolu-Online, Dolu-Offline, Arama Eşleşmesi).
   - **Akıllı IP Atama Sihirbazı:** Ağda bir sonraki boş IP'yi otomatik hesaplar ve panoya kopyalar.
   - IP ve MAC adresi çakışma uyarı kutuları.
   - Seçili hücre inceleme çekmecesi.

---

### F. Bakım & Operasyonlar
1. **`MaintenanceGridPanel.jsx`**:
   - Ocak - Aralık 12 aylık periyodik bakım kontrol matrisi.
   - Tek tıkla bakım tamamlama / geri alma toggle'ları.
   - Departman ve cihaz arama filtreleri.
2. **`ActionsPanel.jsx`**:
   - Servis müdahaleleri, parça değişimleri ve teknik işlem log tablosu.
   - Parça türü ve marka filtreleri, işlem detay modalı.
3. **`MaterialsPanel.jsx`**:
   - Gelen/giden yedek parça ve sarf malzeme hareketleri.
   - Tedarikçi/geliş yeri, garanti durumu, seri no ve adet takibi.
4. **`PhoneDirectoryPanel.jsx`**:
   - Bina sekmeleri ve departman filtreleri.
   - Dahili numara kopyalama ve arama özellikleri.
   - Excel ile toplu içe aktarma desteği.

---

### G. Analitik & Raporlar (Analytics)
1. **`AnalyticsPanel.jsx`**:
   - Cihaz durum oranları PieChart.
   - En çok kaynak tüketen cihazlar CPU & RAM BarChart.
   - Ortalama Ping gecikme geçmişi AreaChart.
   - Malzeme giriş/çıkış trendi AreaChart.
   - Yazıcı toner tüketim ve kalan gün öngörü tablosu.

---

### H. PDF & Dosya Araçları
1. **`PdfToolsDashboard.jsx` & `FileToolsDashboard.jsx`**:
   - PDF Birleştir, Böl, Düzenle, Sıkıştır, Filigran Ekle kartları.
   - Görsel Boyutlandır, Sıkıştır, Format Dönüştür, CSV Düzeltici, ZIP Oluşturucu ve Toplu Yeniden Adlandır araçları.

---

### I. Giriş & Güvenlik (Login)
1. **`Login.jsx`**:
   - Kurumsal OnOffDash V2 logosu, modern kart yerleşimi, kullanıcı adı ve şifre giriş alanları, hata bildirimleri.

---

## 4. Doğrulama ve Derleme

- Frontend projesi `npm run build` ile derlenmiş ve **0 hata** ile başarıyla tamamlanmıştır.
- Tüm backend API endpoint'leri, WebSocket event dinleyicileri ve kimlik doğrulama akışları eksiksiz korunmuştur.
