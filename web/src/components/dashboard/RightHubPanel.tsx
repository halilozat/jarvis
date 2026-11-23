import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '../../lib/markdown';
import { voice } from '../../lib/speech';
import {
  CATEGORY_LABEL,
  DEVICE_LABEL,
  type CoreState,
  type JarvisReply,
  type NewsStats,
  type SessionSummary,
  type StoredMessage,
} from '../../lib/types';
import type { AgendaItem } from './agenda';
import { DashPanel, NoData } from './common';

interface RightHubProps {
  index: number;
  data: NewsStats | null;
  loading: boolean;
  demo: boolean;
  reply: JarvisReply | null;
  agenda: AgendaItem[];
  sceneIdx: number;
  showAgenda: boolean;
  messages: StoredMessage[];
  core: CoreState;
  telemetry: string[];
  sessions: SessionSummary[];
  activeSessionId: string;
  activeSessionTitle: string;
  onSwitchSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
}

export const RightHubPanel = memo(function RightHubPanel({
  index,
  data,
  loading,
  demo,
  reply,
  agenda,
  sceneIdx,
  showAgenda,
  messages,
  core,
  telemetry,
  sessions,
  activeSessionId,
  activeSessionTitle,
  onSwitchSession,
  onCreateSession,
  onDeleteSession,
}: RightHubProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'gundem' | 'chat'>(messages.length > 0 ? 'chat' : 'gundem');
  const [showHistory, setShowHistory] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef(messages.length);

  // Yeni mesaj geldiğinde ya da Jarvis düşünürken/yanıtlarken otomatik CHAT sekmesini aktif yap
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current || core === 'thinking' || core === 'speaking') {
      setActiveTab('chat');
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, core]);

  // Chat sekmesine geçildiğinde okunmamış işaretini kaldır ve en alta kaydır
  useEffect(() => {
    if (activeTab === 'chat') {
      setHasUnreadChat(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, messages.length]);

  // Gündem kategorileri
  const cats = data?.by_category.slice(0, 6) ?? [];
  const max = Math.max(1, ...cats.map(c => c.count));

  // Akış için aktif madde (Agenda)
  const activeAgendaIdx = useMemo(
    () => agenda.findIndex(it => sceneIdx >= it.start && sceneIdx < it.end),
    [agenda, sceneIdx]
  );
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activeAgendaIdx < 0 || !reply) return;
    const it = agenda[activeAgendaIdx];
    const text = reply.sahneler[sceneIdx]?.ses ?? '';
    const t0 = performance.now();
    let raf = 0;
    const loop = () => {
      const p = voice.progress() ?? Math.min(1, (performance.now() - t0) / Math.max(2600, text.length * 55));
      const total = Math.min(1, (sceneIdx - it.start + p) / (it.end - it.start));
      if (barRef.current) barRef.current.style.transform = `scaleY(${total})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activeAgendaIdx, agenda, reply, sceneIdx]);

  return (
    <DashPanel
      index={index}
      label=""
      demo={demo}
      className={`right-hub-panel ${activeTab === 'chat' ? 'is-chat-active' : ''}`}
    >
      {/* İki Başlıklı Sekme Çubuğu: GÜNDEM ve CHAT */}
      <div className="hub-tabs">
        <button
          type="button"
          className={`hub-tab ${activeTab === 'gundem' ? 'on' : ''}`}
          onClick={() => setActiveTab('gundem')}
        >
          <span className="hub-tab-icon">📰</span>
          <span>GÜNDEM</span>
        </button>

        <button
          type="button"
          className={`hub-tab ${activeTab === 'chat' ? 'on' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <span className="hub-tab-icon">💬</span>
          <span>CHAT</span>
          {hasUnreadChat && <span className="hub-badge" title="Yeni mesaj" />}
        </button>
      </div>

      {/* 1. SEÇENEK: GÜNDEM ALANI */}
      {activeTab === 'gundem' && (
        <div className="hub-content gundem-view">
          {showAgenda && reply ? (
            <div className="hub-agenda-wrapper">
              <div className="hub-view-title">Bugünün Akışı</div>
              <ol className="ag-list">
                {agenda.map((it, k) => {
                  const state = k === activeAgendaIdx ? 'active' : sceneIdx >= it.end ? 'past' : 'next';
                  return (
                    <li key={it.start} className={state}>
                      <span className="ag-bar"><i ref={k === activeAgendaIdx ? barRef : undefined} /></span>
                      <span className="ag-n">{String(k + 1).padStart(2, '0')}</span>
                      <span className="ag-title">{it.title}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : loading ? (
            <NoData loading />
          ) : !data || data.total === 0 ? (
            <NoData />
          ) : (
            <div className="hub-news-wrapper">
              <div className="ns-total">
                <b>{data.total}</b> haber <span className="sep">·</span> <b>{data.sources_ok}</b> kaynak
              </div>
              <ul className="ns-bars">
                {cats.map((c, i) => (
                  <li key={c.category}>
                    <span className="ns-cat">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                    <span className="ns-track">
                      <motion.i
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: c.count / max }}
                        transition={{ delay: 0.2 + i * 0.05, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                      />
                    </span>
                    <span className="ns-n">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 2. SEÇENEK: WHATSAPP TARZI CHAT VE OTURUM ALANI */}
      {activeTab === 'chat' && (
        <div className="hub-content chat-view">
          {/* Oturum Başlığı ve Butonları */}
          <div className="chat-subhead">
            <div className="chat-session-title" title={activeSessionTitle || 'Sohbet'}>
              <span className="dot online" />
              <span className="title-txt">{activeSessionTitle || 'Aktif Sohbet'}</span>
            </div>
            <div className="chat-subhead-actions">
              <button
                type="button"
                className="chat-subhead-btn"
                onClick={onCreateSession}
                title="Yeni Oturum Aç"
              >
                + Yeni
              </button>
              <button
                type="button"
                className={`chat-subhead-btn ${showHistory ? 'on' : ''}`}
                onClick={() => setShowHistory(h => !h)}
                title="Geçmiş Oturumlar"
              >
                🕒 Geçmiş ({sessions.length})
              </button>
            </div>
          </div>

          {/* Geçmiş Oturumlar Açılır Paneli */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                className="sessions-drawer"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="sessions-drawer-head">
                  <span>Kayıtlı Sohbet Oturumları</span>
                  <button type="button" onClick={() => setShowHistory(false)}>✕</button>
                </div>
                <div className="sessions-list">
                  {sessions.length === 0 && <div className="no-sessions">Henüz geçmiş sohbet yok.</div>}
                  {sessions.map(s => (
                    <div
                      key={s.id}
                      className={`session-row ${s.id === activeSessionId ? 'is-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="session-row-main"
                        onClick={() => {
                          onSwitchSession(s.id);
                          setShowHistory(false);
                        }}
                      >
                        <div className="session-name">{s.title || 'Başlıksız Sohbet'}</div>
                        <div className="session-meta">
                          {new Date(s.updatedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {s.messageCount} mesaj
                        </div>
                      </button>
                      {sessions.length > 1 && (
                        <button
                          type="button"
                          className="session-row-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(s.id);
                          }}
                          title="Oturumu Sil"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mesaj Akışı (WhatsApp Görünümü) */}
          <div className="chat-stream">
            {messages.length === 0 && (
              <div className="chat-empty">
                <span className="empty-icon">💬</span>
                <p>Henüz bir mesaj yok.</p>
                <small>Jarvis'e bir şey yazın veya mikrofonla seslenin.</small>
              </div>
            )}

            {messages.map((m, idx) => {
              const isUser = m.role === 'user';
              const timeStr = m.at ? new Date(m.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

              return (
                <div
                  key={idx}
                  className={`chat-bubble-row ${isUser ? 'user' : 'assistant'}`}
                >
                  <div className="chat-bubble">
                    <div className="bubble-header">
                      <span className="bubble-author">
                        {isUser ? `Sen (${DEVICE_LABEL[m.device] || 'cihaz'})` : 'JARVIS'}
                      </span>
                      <span className="bubble-time">{timeStr}</span>
                    </div>

                    {/* Çift metin basılmasını önle: detay metni m.text ile aynı veya onu kapsıyorsa sadece detay render edilir */}
                    {(() => {
                      const textTrimmed = m.text?.trim() || '';
                      const detailTrimmed = m.reply?.detay?.trim() || '';
                      const isAssistant = !isUser;

                      // Eğer detay metni m.text ile birebir aynıysa veya m.text onun başında yer alıyorsa
                      const detailCoversText = isAssistant && detailTrimmed.length > 0 && (
                        detailTrimmed === textTrimmed ||
                        detailTrimmed.startsWith(textTrimmed) ||
                        (textTrimmed.length > 40 && detailTrimmed.includes(textTrimmed.slice(0, 40)))
                      );

                      if (detailCoversText) {
                        return (
                          <div className="bubble-detail">
                            <Markdown text={detailTrimmed} />
                          </div>
                        );
                      }

                      return (
                        <>
                          {textTrimmed && <div className="bubble-text">{textTrimmed}</div>}
                          {isAssistant && detailTrimmed && (
                            <div className="bubble-detail">
                              <Markdown text={detailTrimmed} />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Düşünme / Üretme Göstergesi */}
            {core === 'thinking' && (
              <div className="chat-bubble-row assistant thinking">
                <div className="chat-bubble is-thinking">
                  <div className="bubble-header">
                    <span className="bubble-author">JARVIS</span>
                    <span className="bubble-time">düşünüyor…</span>
                  </div>
                  <div className="thinking-dots">
                    <span /><span /><span />
                  </div>
                  {telemetry.length > 0 && (
                    <div className="thinking-telemetry">
                      {telemetry.slice(-2).map((t, i) => (
                        <div key={i} className="tl-mini-line">» {t}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </DashPanel>
  );
});
