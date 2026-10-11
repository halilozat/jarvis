import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { reportVideoBlocked } from '../lib/api';

export interface VideoInfo { id: string; title: string; channel: string; external?: boolean; /** Shorts: dikey oynatıcı */ vertical?: boolean }

const watchUrl = (id: string, shorts?: boolean) => (shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);

/**
 * Jarvis içinde YouTube: resmi gömme oynatıcı (youtube-nocookie). Video bitince kendiliğinden kapanır.
 * Sahibi başka sitelerde oynatmayı kapattıysa (S Sport) ya da oynatıcı engel bildirirse (LaLiga: hata 101/150)
 * "YouTube'da izle" kartı gösterilir; engel sunucuya bildirilir, o kanal bir daha Jarvis içinde denenmez.
 */
export function VideoPanel({ video, onClose }: { video: VideoInfo; onClose(): void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [external, setExternal] = useState(!!video.external);

  useEffect(() => {
    if (external) return;
    // Oynatıcıya "olaylarını bana gönder" de (enablejsapi=1): durum 0 = bitti, hata 101/150 = sahibi engelledi
    const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const state = d?.event === 'onStateChange' ? d.info : d?.info?.playerState;
        if (state === 0) setTimeout(onClose, 1200);
        if (d?.event === 'onError' && [100, 101, 150, 153].includes(Number(d.info))) {
          reportVideoBlocked(video.id, Number(d.info));
          setExternal(true);
        }
      } catch { /* yok say */ }
    };
    window.addEventListener('message', onMsg);
    const t = setInterval(listen, 800);
    return () => { window.removeEventListener('message', onMsg); clearInterval(t); };
  }, [video.id, onClose, external]);

  const src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  return (
    <motion.div className="video-panel" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
      <div className={'vp-frame' + (external ? ' ext' : '') + (video.vertical ? ' vertical' : '')}>
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <header className="vp-head">
          <span className="vp-tag">▶ YOUTUBE</span>
          <span className="vp-title">{video.title}</span>
          <span className="vp-ch">{video.channel}</span>
          <button className="vp-close" onClick={onClose} aria-label="Videoyu kapat">✕</button>
        </header>
        <div className="vp-player">
          {external ? (
            <a className="vp-ext" href={watchUrl(video.id, video.vertical)} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(onClose, 300)}>
              <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" />
              <span className="vp-ext-scan" />
              <span className="vp-ext-body">
                <span className="vp-ext-play">▶</span>
                <b>YouTube'da izle</b>
                <em>{video.channel} bu videonun yalnızca YouTube'da izlenmesine izin veriyor</em>
              </span>
            </a>
          ) : (
            <iframe ref={frame} src={src} title={video.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
