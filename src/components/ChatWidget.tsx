"use client";

/**
 * ChatWidget — Assistant client flottant Yassala Night
 *
 * Fonctionnalités :
 *  - Suivi commande en temps réel par numéro de téléphone
 *  - FAQ auto : horaires, zone, paiement, contact
 *  - Stockage interactions dans support_logs/{id}
 *  - Caché sur /admin, /driver, /livreur, /dev
 *  - Thème dark neon Yassala
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getLastOrderStatus, parseOrderStatus, type OrderStatus } from '@/utils/getLastOrderStatus';

// ── types ────────────────────────────────────────────────────────────────────
type View =
  | 'menu'
  | 'order-input'
  | 'order-status'
  | 'faq-hours'
  | 'faq-zone'
  | 'faq-payment'
  | 'faq-contact';

// ── helpers ──────────────────────────────────────────────────────────────────
function logInteraction(type: string, payload?: Record<string, unknown>) {
  addDoc(collection(db, 'support_logs'), {
    type,
    payload: payload ?? {},
    createdAt: new Date().toISOString(),
    source: 'chat_widget',
  }).catch(() => {});
}

const HIDDEN_PREFIXES = ['/admin', '/driver', '/livreur', '/dev'];

// ── ChatWidget ────────────────────────────────────────────────────────────────
export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen]       = useState(false);
  const [view, setView]       = useState<View>('menu');
  const [phone, setPhone]     = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [searching, setSearching]   = useState(false);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [orderNotFound, setOrderNotFound] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const unsubRef = useRef<(() => void) | null>(null);

  // ── hide on internal routes ───────────────────────────────────────────────
  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null;

  // ── restore saved phone ───────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    try {
      const saved = localStorage.getItem('yassala_customer_phone');
      if (saved) setPhone(saved);
    } catch {}
  }, []);

  // ── fetch whatsapp from settings ──────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    getDoc(doc(db, 'settings', 'general')).then(snap => {
      const data = snap.data();
      if (data?.whatsapp) setWhatsapp(data.whatsapp as string);
    }).catch(() => {});
  }, []);

  // ── cleanup realtime sub on close / view change ───────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    return () => { unsubRef.current?.(); };
  }, []);

  // ── actions ───────────────────────────────────────────────────────────────
  function openWidget() {
    setOpen(true);
    setView('menu');
    logInteraction('widget_open');
  }

  function closeWidget() {
    setOpen(false);
    unsubRef.current?.();
    unsubRef.current = null;
  }

  function goBack() {
    unsubRef.current?.();
    unsubRef.current = null;
    setOrderStatus(null);
    setOrderNotFound(false);
    setView('menu');
  }

  function goToView(v: View, logType?: string) {
    setView(v);
    if (logType) logInteraction(logType);
  }

  async function handleTrackOrder() {
    const p = phoneInput.trim();
    if (!p) return;

    setSearching(true);
    setOrderNotFound(false);
    setOrderStatus(null);

    try {
      localStorage.setItem('yassala_customer_phone', p);
    } catch {}
    setPhone(p);

    logInteraction('order_track', { phone: p.replace(/\d(?=\d{4})/g, '*') });

    const result = await getLastOrderStatus(p);

    if (!result) {
      setSearching(false);
      setOrderNotFound(true);
      setView('order-status');
      return;
    }

    // Subscribe to real-time updates for the found order
    unsubRef.current?.();
    const unsub = onSnapshot(doc(db, 'orders', result.orderId), snap => {
      if (!snap.exists()) {
        setOrderStatus(null);
        setOrderNotFound(true);
        return;
      }
      const data = snap.data() as any;
      const parsed = parseOrderStatus(data.status);
      setOrderStatus({
        orderId:     result.orderId,
        status:      data.status,
        statusLabel: parsed.label,
        statusIcon:  parsed.icon,
        statusColor: parsed.color,
        orderNumber: data.orderNumber,
        createdAt:   data.createdAt,
        items:       data.items ?? '',
        total:       data.total ?? 0,
      });
    });
    unsubRef.current = unsub;

    setSearching(false);
    setView('order-status');
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes cw-fadeIn { from{opacity:0;transform:scale(.92) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes cw-pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(255,45,120,.5)} 70%{box-shadow:0 0 0 10px rgba(255,45,120,0)} }
        .cw-btn:hover { opacity:.88; transform:scale(1.03); }
        .cw-action:hover { background:rgba(255,45,120,.18) !important; }
        .cw-back:hover { color:#00f5ff !important; }
      `}</style>

      {/* ── Floating trigger button ── */}
      {!open && (
        <button
          onClick={openWidget}
          className="cw-btn"
          style={{
            position:'fixed', bottom:24, right:20, zIndex:9999,
            width:56, height:56, borderRadius:'50%',
            background:'linear-gradient(135deg,#ff2d78,#c0145a)',
            border:'none', cursor:'pointer',
            boxShadow:'0 4px 20px rgba(255,45,120,.5)',
            animation:'cw-pulse 2.5s infinite',
            fontSize:'1.6rem', display:'flex', alignItems:'center', justifyContent:'center',
            transition:'opacity .2s, transform .2s',
          }}
          aria-label="Assistance client"
        >
          💬
        </button>
      )}

      {/* ── Widget panel ── */}
      {open && (
        <div
          style={{
            position:'fixed', bottom:20, right:16, zIndex:9999,
            width:'min(340px, calc(100vw - 32px))',
            background:'#0a0a12',
            border:'1px solid rgba(255,45,120,.3)',
            borderRadius:18,
            boxShadow:'0 8px 40px rgba(0,0,0,.7), 0 0 40px rgba(255,45,120,.08)',
            overflow:'hidden',
            animation:'cw-fadeIn .25s both',
            fontFamily:"'Inter', sans-serif",
          }}
        >
          {/* Header */}
          <div style={{
            background:'linear-gradient(135deg,#1a0a12,#120a1a)',
            borderBottom:'1px solid rgba(255,45,120,.2)',
            padding:'14px 16px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {view !== 'menu' && (
                <button
                  onClick={goBack}
                  className="cw-back"
                  style={{
                    background:'none', border:'none', cursor:'pointer',
                    color:'#5a5470', fontSize:'.9rem', padding:'0 4px 0 0',
                    transition:'color .2s',
                  }}
                >
                  ←
                </button>
              )}
              <div style={{
                width:32, height:32, borderRadius:'50%',
                background:'linear-gradient(135deg,#ff2d78,#c0145a)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'1rem', flexShrink:0,
              }}>
                🦇
              </div>
              <div>
                <div style={{
                  fontWeight:700, fontSize:'.88rem', color:'#f0eeff',
                  letterSpacing:'.02em',
                }}>
                  YASSALA NIGHT
                </div>
                <div style={{
                  fontSize:'.68rem', color:'#b8ff00',
                  letterSpacing:'.08em',
                }}>
                  ● EN LIGNE
                </div>
              </div>
            </div>
            <button
              onClick={closeWidget}
              style={{
                background:'none', border:'none', cursor:'pointer',
                color:'#5a5470', fontSize:'1.2rem', lineHeight:1,
                padding:4,
              }}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding:'16px', maxHeight:'calc(100vh - 200px)', overflowY:'auto' }}>

            {/* ── MENU ── */}
            {view === 'menu' && (
              <div>
                <div style={{
                  fontSize:'.82rem', color:'#d0d0e0', marginBottom:14, lineHeight:1.5,
                }}>
                  Bonjour ! Comment puis-je vous aider ? 👋
                </div>
                {[
                  { icon:'📦', label:'Où est ma commande ?', action: () => {
                    if (phone) {
                      setPhoneInput(phone);
                    }
                    goToView('order-input', 'faq_order');
                  }},
                  { icon:'🕐', label:'Horaires d\'ouverture',  action: () => goToView('faq-hours',   'faq_hours')   },
                  { icon:'📍', label:'Zone de livraison',      action: () => goToView('faq-zone',    'faq_zone')    },
                  { icon:'💳', label:'Modes de paiement',      action: () => goToView('faq-payment', 'faq_payment') },
                  { icon:'📞', label:'Nous contacter',         action: () => goToView('faq-contact', 'faq_contact') },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="cw-action"
                    style={{
                      width:'100%', textAlign:'left',
                      background:'rgba(255,45,120,.08)',
                      border:'1px solid rgba(255,45,120,.15)',
                      borderRadius:10, padding:'11px 14px',
                      marginBottom:8, cursor:'pointer',
                      display:'flex', alignItems:'center', gap:10,
                      color:'#f0eeff', fontSize:'.85rem', fontWeight:500,
                      transition:'background .18s',
                    }}
                  >
                    <span style={{ fontSize:'1.1rem', flexShrink:0 }}>{item.icon}</span>
                    {item.label}
                    <span style={{ marginLeft:'auto', color:'#5a5470', fontSize:'.8rem' }}>›</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── ORDER INPUT ── */}
            {view === 'order-input' && (
              <div>
                <div style={{ fontSize:'.82rem', color:'#d0d0e0', marginBottom:14 }}>
                  Entrez le numéro de téléphone utilisé lors de votre commande :
                </div>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleTrackOrder(); }}
                  placeholder="+594 694 00 00 00"
                  autoFocus
                  style={{
                    width:'100%', padding:'11px 14px',
                    background:'rgba(255,255,255,.05)',
                    border:'1px solid rgba(0,245,255,.25)',
                    borderRadius:10, color:'#f0eeff',
                    fontSize:'.88rem', outline:'none',
                    boxSizing:'border-box',
                  }}
                />
                <button
                  onClick={handleTrackOrder}
                  disabled={searching || !phoneInput.trim()}
                  style={{
                    width:'100%', marginTop:10,
                    padding:'12px',
                    background: (searching || !phoneInput.trim())
                      ? 'rgba(255,45,120,.3)'
                      : 'linear-gradient(135deg,#ff2d78,#c0145a)',
                    border:'none', borderRadius:10,
                    color:'#fff', fontWeight:700, fontSize:'.88rem',
                    cursor: (searching || !phoneInput.trim()) ? 'not-allowed' : 'pointer',
                    letterSpacing:'.04em',
                  }}
                >
                  {searching ? '⏳ Recherche...' : '🔍 SUIVRE MA COMMANDE'}
                </button>
              </div>
            )}

            {/* ── ORDER STATUS ── */}
            {view === 'order-status' && (
              <div>
                {!orderStatus && !orderNotFound && (
                  <div style={{ textAlign:'center', padding:'20px 0', color:'#5a5470',
                    fontSize:'.82rem', fontFamily:'monospace' }}>
                    ⏳ Chargement...
                  </div>
                )}

                {orderNotFound && (
                  <div style={{ textAlign:'center', padding:'12px 0' }}>
                    <div style={{ fontSize:'2rem', marginBottom:10 }}>🤔</div>
                    <div style={{ fontSize:'.85rem', color:'#f0eeff', marginBottom:6 }}>
                      Aucune commande trouvée
                    </div>
                    <div style={{ fontSize:'.78rem', color:'#5a5470', lineHeight:1.5 }}>
                      Vérifiez que le numéro correspond exactement à celui utilisé pour commander.
                    </div>
                    <button
                      onClick={() => { setOrderNotFound(false); setView('order-input'); }}
                      style={{
                        marginTop:14, padding:'10px 18px',
                        background:'rgba(255,45,120,.15)',
                        border:'1px solid rgba(255,45,120,.3)',
                        borderRadius:8, color:'#ff2d78',
                        cursor:'pointer', fontSize:'.82rem', fontWeight:600,
                      }}
                    >
                      Réessayer
                    </button>
                  </div>
                )}

                {orderStatus && (
                  <div>
                    {/* Status header */}
                    <div style={{
                      background:'rgba(255,255,255,.03)',
                      border:`1px solid ${orderStatus.statusColor}33`,
                      borderRadius:12, padding:'14px 16px', marginBottom:12,
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                        <span style={{ fontSize:'1.5rem' }}>{orderStatus.statusIcon}</span>
                        <div>
                          <div style={{
                            fontWeight:700, fontSize:'.9rem',
                            color: orderStatus.statusColor,
                          }}>
                            {orderStatus.statusLabel}
                          </div>
                          <div style={{
                            fontSize:'.72rem', color:'#5a5470',
                            fontFamily:'monospace', marginTop:2,
                          }}>
                            #{orderStatus.orderNumber
                              ? String(orderStatus.orderNumber).padStart(4, '0')
                              : orderStatus.orderId.slice(-8).toUpperCase()}
                          </div>
                        </div>
                        {/* Live dot for active orders */}
                        {(orderStatus.status === 'en_cours' || orderStatus.status === 'assigned' || orderStatus.status === 'picked_up') && (
                          <div style={{
                            marginLeft:'auto', width:8, height:8, borderRadius:'50%',
                            background:'#b8ff00', boxShadow:'0 0 8px #b8ff00',
                          }} />
                        )}
                      </div>

                      {/* Items summary */}
                      {orderStatus.items && (
                        <div style={{
                          fontSize:'.75rem', color:'#a0a0c0', lineHeight:1.6,
                          borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:8,
                          maxHeight:80, overflowY:'auto',
                        }}>
                          {orderStatus.items.split('\n').slice(0, 4).map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                      )}

                      <div style={{
                        marginTop:8,
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:8,
                      }}>
                        <span style={{ fontSize:'.75rem', color:'#5a5470' }}>
                          {orderStatus.createdAt
                            ? new Date(orderStatus.createdAt).toLocaleString('fr-FR', {
                                day:'2-digit', month:'2-digit',
                                hour:'2-digit', minute:'2-digit',
                              })
                            : ''}
                        </span>
                        <span style={{
                          fontWeight:700, fontSize:'.88rem', color:'#b8ff00',
                        }}>
                          {Number(orderStatus.total).toFixed(2)} €
                        </span>
                      </div>
                    </div>

                    {/* Suivi link */}
                    <a
                      href={`/suivi?id=${orderStatus.orderId}`}
                      onClick={() => logInteraction('suivi_open', { orderId: orderStatus!.orderId })}
                      style={{
                        display:'block', textAlign:'center',
                        padding:'11px', borderRadius:10, marginBottom:8,
                        background:'rgba(0,245,255,.08)',
                        border:'1px solid rgba(0,245,255,.2)',
                        color:'#00f5ff', fontSize:'.82rem', fontWeight:600,
                        textDecoration:'none', letterSpacing:'.04em',
                      }}
                    >
                      🗺️ VOIR LE SUIVI COMPLET
                    </a>

                    {/* Phone change */}
                    <button
                      onClick={() => { setOrderStatus(null); setView('order-input'); }}
                      style={{
                        width:'100%', padding:'9px',
                        background:'none',
                        border:'1px solid rgba(255,255,255,.06)',
                        borderRadius:8, color:'#5a5470',
                        cursor:'pointer', fontSize:'.78rem',
                      }}
                    >
                      Autre numéro
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── FAQ HOURS ── */}
            {view === 'faq-hours' && (
              <FaqCard icon="🕐" title="Horaires d'ouverture">
                <p>Nous livrons <strong style={{ color:'#ff2d78' }}>tous les soirs</strong> :</p>
                <div style={{
                  background:'rgba(255,45,120,.08)',
                  border:'1px solid rgba(255,45,120,.2)',
                  borderRadius:10, padding:'12px 16px',
                  marginTop:10, marginBottom:10,
                  textAlign:'center',
                }}>
                  <div style={{
                    fontFamily:'monospace', fontSize:'1.4rem',
                    fontWeight:700, color:'#ff2d78', letterSpacing:'.04em',
                  }}>
                    20h00 → 06h00
                  </div>
                  <div style={{ fontSize:'.72rem', color:'#5a5470', marginTop:4 }}>
                    7j/7 — même les jours fériés 🎉
                  </div>
                </div>
                <p style={{ color:'#a0a0c0', fontSize:'.82rem', lineHeight:1.5 }}>
                  Les commandes passées avant minuit sont généralement livrées en <strong style={{ color:'#b8ff00' }}>20–40 minutes</strong>.
                </p>
              </FaqCard>
            )}

            {/* ── FAQ ZONE ── */}
            {view === 'faq-zone' && (
              <FaqCard icon="📍" title="Zone de livraison">
                <p style={{ color:'#a0a0c0', fontSize:'.82rem', lineHeight:1.6, marginBottom:10 }}>
                  Nous livrons actuellement dans les communes suivantes :
                </p>
                {['🏙️ Cayenne', '🌴 Matoury', '🛤️ Rémire-Montjoly'].map(z => (
                  <div key={z} style={{
                    padding:'9px 14px', marginBottom:6,
                    background:'rgba(0,245,255,.06)',
                    border:'1px solid rgba(0,245,255,.15)',
                    borderRadius:8, fontSize:'.85rem', color:'#00f5ff',
                    fontWeight:500,
                  }}>
                    {z}
                  </div>
                ))}
                <div style={{
                  marginTop:10, padding:'10px 14px',
                  background:'rgba(255,45,120,.06)',
                  border:'1px solid rgba(255,45,120,.15)',
                  borderRadius:8, fontSize:'.78rem', color:'#5a5470', lineHeight:1.5,
                }}>
                  ℹ️ Des frais de livraison peuvent s'appliquer selon votre distance.
                </div>
              </FaqCard>
            )}

            {/* ── FAQ PAYMENT ── */}
            {view === 'faq-payment' && (
              <FaqCard icon="💳" title="Modes de paiement">
                <p style={{ color:'#a0a0c0', fontSize:'.82rem', lineHeight:1.5, marginBottom:12 }}>
                  Plusieurs options à votre disposition :
                </p>
                {[
                  { icon:'💳', label:'Carte bancaire', desc:'Visa, Mastercard – paiement en ligne sécurisé' },
                  { icon:'💵', label:'Espèces', desc:'Au moment de la livraison (appoint apprécié)' },
                  { icon:'📱', label:'Virement / Lydia', desc:'Contactez-nous pour plus d\'infos' },
                ].map(p => (
                  <div key={p.label} style={{
                    display:'flex', gap:10, marginBottom:10,
                    padding:'10px 14px',
                    background:'rgba(255,255,255,.03)',
                    border:'1px solid rgba(255,255,255,.07)',
                    borderRadius:10,
                  }}>
                    <span style={{ fontSize:'1.2rem', flexShrink:0 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontWeight:600, fontSize:'.85rem', color:'#f0eeff' }}>{p.label}</div>
                      <div style={{ fontSize:'.75rem', color:'#5a5470', marginTop:2 }}>{p.desc}</div>
                    </div>
                  </div>
                ))}
              </FaqCard>
            )}

            {/* ── FAQ CONTACT ── */}
            {view === 'faq-contact' && (
              <FaqCard icon="📞" title="Nous contacter">
                <p style={{ color:'#a0a0c0', fontSize:'.82rem', lineHeight:1.5, marginBottom:12 }}>
                  Une question, un problème ? On est là :
                </p>
                {whatsapp ? (
                  <a
                    href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => logInteraction('whatsapp_click')}
                    style={{
                      display:'flex', alignItems:'center', gap:12,
                      padding:'14px 16px',
                      background:'rgba(37,211,102,.1)',
                      border:'1px solid rgba(37,211,102,.3)',
                      borderRadius:12, textDecoration:'none',
                      marginBottom:10,
                    }}
                  >
                    <span style={{ fontSize:'1.4rem' }}>💬</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'.88rem', color:'#25d366' }}>
                        WhatsApp
                      </div>
                      <div style={{ fontSize:'.75rem', color:'#5a5470' }}>
                        {whatsapp}
                      </div>
                    </div>
                    <span style={{ marginLeft:'auto', color:'#5a5470', fontSize:'.85rem' }}>›</span>
                  </a>
                ) : (
                  <div style={{
                    padding:'14px 16px',
                    background:'rgba(255,255,255,.03)',
                    border:'1px solid rgba(255,255,255,.08)',
                    borderRadius:12, marginBottom:10,
                    fontSize:'.82rem', color:'#5a5470', textAlign:'center',
                  }}>
                    ⏳ Chargement du contact...
                  </div>
                )}
                <div style={{
                  padding:'10px 14px',
                  background:'rgba(255,45,120,.06)',
                  border:'1px solid rgba(255,45,120,.12)',
                  borderRadius:8, fontSize:'.78rem', color:'#5a5470', lineHeight:1.5,
                }}>
                  🕐 Support disponible pendant les heures de service (20h–06h)
                </div>
              </FaqCard>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:'10px 16px',
            borderTop:'1px solid rgba(255,255,255,.05)',
            textAlign:'center',
            fontSize:'.65rem', color:'#3a3450',
            fontFamily:'monospace', letterSpacing:'.06em',
          }}>
            YASSALA NIGHT — LIVRAISON EN GUYANE
          </div>
        </div>
      )}
    </>
  );
}

// ── FaqCard helper ────────────────────────────────────────────────────────────
function FaqCard({
  icon, title, children,
}: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <span style={{ fontSize:'1.3rem' }}>{icon}</span>
        <span style={{ fontWeight:700, fontSize:'.92rem', color:'#f0eeff' }}>{title}</span>
      </div>
      <div style={{ color:'#d0d0e0', fontSize:'.82rem', lineHeight:1.6 }}>
        {children}
      </div>
    </div>
  );
}
