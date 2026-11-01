'use client';
import { useEffect, useState } from 'react';
import { hashPhonePin, loadPhoneLock } from '@/lib/phone-lock';
import { getChatImageFromIndexedDB } from '@/lib/chat-asset-storage';
import './phone-lock.css';
export function PhoneLockScreen({ ready, onEnter }: {
    ready: boolean;
    onEnter: () => void;
}) {
    const [clock, setClock] = useState<Date | null>(null), [pin, setPin] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [wallpaper, setWallpaper] = useState('');
    const config = ready ? loadPhoneLock() : null;
    useEffect(() => { setClock(new Date()); const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);
    useEffect(() => { let alive = true; if (!ready)
        return; const c = loadPhoneLock(); if (!c.enabled) {
        onEnter();
        return;
    } if (c.wallpaper.startsWith('data:') || c.wallpaper.startsWith('https:'))
        setWallpaper(c.wallpaper);
    else if (c.wallpaper)
        void getChatImageFromIndexedDB(c.wallpaper).then(url => { if (alive)
            setWallpaper(url || ''); }); return () => { alive = false; }; }, [ready, onEnter]);
    async function digit(d: string) { if (!ready || busy || !config?.pinHash)
        return; const next = (pin + d).slice(0, config.pinLength); setPin(next); setError(''); if (next.length === config.pinLength) {
        setBusy(true);
        try {
            if (await hashPhonePin(next) === config.pinHash)
                onEnter();
            else {
                setPin('');
                setError('密码不正确，请重试');
            }
        }
        finally {
            setBusy(false);
        }
    } }
    return <div className="phone-lock" style={wallpaper ? { backgroundImage: `linear-gradient(#0002,#0005),url("${wallpaper}")` } : undefined}>
 <div className="phone-lock-clock"><time>{clock?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) || '--:--'}</time><div>{clock?.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</div></div>
 <div className="phone-lock-title">{!ready ? '正在读取本机数据…' : config?.pinHash ? '输入密码' : '轻触进入'}</div>
 {config?.pinHash ? <><div className="phone-lock-dots" aria-label={`已输入 ${pin.length} 位密码`}>{Array.from({ length: config.pinLength }, (_, i) => <span key={i} data-filled={i < pin.length}/>)}</div><div className="phone-lock-error" role="status">{error}</div><div className="phone-lock-keys">{'1234567890'.split('').map(d => <button key={d} disabled={busy} onClick={() => void digit(d)}>{d}</button>)}</div></> : <button className="phone-lock-enter" disabled={!ready} onClick={onEnter}>进入</button>}
 <div className="phone-lock-bottom"><button disabled={!ready} onClick={onEnter}>紧急情况</button><button disabled={!ready || busy} onClick={() => { setPin(p => p.slice(0, -1)); setError(''); }}>取消</button></div></div>;
}
