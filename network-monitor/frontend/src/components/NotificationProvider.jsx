import { useEffect, useRef, useCallback, useState } from 'react';

// Bildirim sesleri (base64 encoded short beep)
const ALERT_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHU6c2/HNdTYaP4PM9+GHRig8drjl8ZpVMi5aoNXwrHI8HkKOs+3feUYpNXOn3u6dYzklTZjQ8LF2RB5FjbTj44ZMKDN0q9/tn2EzJUqRx+yyeUshRoi03NyFSSg2';

let notificationIdCounter = 0;

export default function NotificationProvider({ socket, children }) {
    const audioRef = useRef(null);
    const [notifications, setNotifications] = useState([]);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const notifiedRef = useRef(new Set()); // Duplicate engelleme

    // Bildirim izni iste
    useEffect(() => {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                setPermissionGranted(true);
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(perm => {
                    setPermissionGranted(perm === 'granted');
                });
            }
        }
    }, []);

    // Ses çal
    const playAlert = useCallback(() => {
        try {
            if (!audioRef.current) {
                audioRef.current = new Audio(ALERT_SOUND_URL);
                audioRef.current.volume = 0.5;
            }
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
        } catch (e) { /* ses çalma hatası sessizce geç */ }
    }, []);

    // Toast bildirimi göster
    const showToast = useCallback((type, title, message) => {
        const id = ++notificationIdCounter;
        setNotifications(prev => [...prev, { id, type, title, message, timestamp: Date.now() }]);

        // 8 saniye sonra otomatik kapat
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 8000);
    }, []);

    // Push notification göster
    const showPushNotification = useCallback((title, body, icon = '🔔') => {
        if (permissionGranted && document.hidden) {
            try {
                new Notification(title, { body, icon });
            } catch (e) { /* notification API hatası */ }
        }
    }, [permissionGranted]);

    // Duplicate kontrolü (aynı uyarıyı 5 dk içinde tekrar gösterme)
    const shouldNotify = useCallback((key) => {
        if (notifiedRef.current.has(key)) return false;
        notifiedRef.current.add(key);
        setTimeout(() => notifiedRef.current.delete(key), 5 * 60 * 1000);
        return true;
    }, []);

    // Socket event dinleyicileri
    useEffect(() => {
        if (!socket) return;

        // Cihaz offline oldu
        const handleDeviceStatusChanged = (data) => {
            if (data.newStatus === 'offline' && data.oldStatus === 'online') {
                const key = `offline-${data.device?.id}`;
                if (!shouldNotify(key)) return;

                const hostname = data.device?.hostname || data.device?.ip_address || 'Bilinmeyen';
                playAlert();
                showToast('error', '🔴 Cihaz Çevrimdışı', `${hostname} cihazı çevrimdışı oldu`);
                showPushNotification('Cihaz Çevrimdışı', `${hostname} cihazı çevrimdışı oldu`);
            }
        };

        // Yazıcı kağıt sıkışması
        const handlePrinterJam = (data) => {
            const key = `jam-${data.printer_id}`;
            if (!shouldNotify(key)) return;

            playAlert();
            showToast('error', '🖨️ Kağıt Sıkışması!', `${data.printer_name || data.ip_address} yazıcısında kağıt sıkıştı`);
            showPushNotification('Kağıt Sıkışması', `${data.printer_name} yazıcısında kağıt sıkıştı`);
        };

        // Toner düşük
        const handleTonerLow = (data) => {
            const key = `toner-${data.printer_id}`;
            if (!shouldNotify(key)) return;

            const tonerList = data.toners?.map(t => `${t.color}: %${t.percentage}`).join(', ') || '';
            playAlert();
            showToast('warning', '⚠️ Düşük Toner', `${data.printer_name}: ${tonerList}`);
            showPushNotification('Düşük Toner Uyarısı', `${data.printer_name}: ${tonerList}`);
        };

        socket.on('device:statusChanged', handleDeviceStatusChanged);
        socket.on('printer:jam', handlePrinterJam);
        socket.on('toner:low', handleTonerLow);

        return () => {
            socket.off('device:statusChanged', handleDeviceStatusChanged);
            socket.off('printer:jam', handlePrinterJam);
            socket.off('toner:low', handleTonerLow);
        };
    }, [socket, playAlert, showToast, showPushNotification, shouldNotify]);

    // Toast bildirimi kapat
    const dismissToast = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <>
            {children}

            {/* Toast Bildirimleri */}
            {notifications.length > 0 && (
                <div className="toast-container">
                    {notifications.map(n => (
                        <div key={n.id} className={`toast ${n.type}`}>
                            <span className="toast-icon">{n.title.split(' ')[0]}</span>
                            <div className="toast-content">
                                <div className="toast-title">{n.title.substring(n.title.indexOf(' ') + 1)}</div>
                                <div className="toast-message">{n.message}</div>
                            </div>
                            <button className="toast-close" onClick={() => dismissToast(n.id)}>✕</button>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
