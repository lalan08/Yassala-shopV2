"use client";
/**
 * AIChatWidget — Chatbot IA propulsé par Claude
 * Positionné en bas-à-gauche pour coexister avec le ChatWidget (bas-à-droite).
 * Contexte dynamique : produits dispo, settings shop, promo active.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────
type Message = { role: "user" | "assistant"; content: string };

export type AIChatContext = {
  shopOpen: boolean;
  hours: string;
  zone: string;
  deliveryMin: number;
  freeDelivery: number;
  products: { name: string; price: number; stock: number; cat: string }[];
};

interface AIChatWidgetProps {
  context: AIChatContext;
}

// ─── Suggestions rapides ──────────────────────────────────────
const QUICK_QUESTIONS = [
  "Quels produits sont disponibles ?",
  "Vous livrez où ?",
  "Y a-t-il une promo ce soir ?",
  "Quel est le délai de livraison ?",
];

// ─── Parser SSE Anthropic ─────────────────────────────────────
function parseSSEChunk(raw: string): string {
  let out = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const evt = JSON.parse(data);
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        out += evt.delta.text ?? "";
      }
    } catch { /* ignorer */ }
  }
  return out;
}

// ─── Composant ───────────────────────────────────────────────
export default function AIChatWidget({ context }: AIChatWidgetProps) {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [streaming, setStreaming]  = useState("");
  const [unread, setUnread]       = useState(false);
  const [apiMissing, setApiMissing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // Message d'accueil
  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: context.shopOpen
        ? `Bonjour ! 🌙 Je suis l'assistant IA de Yassala. Je connais tous les produits en stock et les offres du soir. Posez-moi n'importe quelle question !`
        : `Bonsoir ! Le shop est actuellement fermé. Je reste disponible pour toutes vos questions sur nos produits et notre service. 😊`,
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll auto
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Focus input
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
      setUnread(false);
    }
  }, [open]);

  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || loading) return;

    setInput("");
    const next: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(next);
    setLoading(true);
    setStreaming("");

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  ctrl.signal,
        body: JSON.stringify({ messages: next, context }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur" }));
        if (res.status === 500 && err.error?.includes("ANTHROPIC_API_KEY")) {
          setApiMissing(true);
        }
        throw new Error(err.error ?? "Erreur API");
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   full    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = parseSSEChunk(decoder.decode(value, { stream: true }));
        if (delta) { full += delta; setStreaming(full); }
      }

      if (full) {
        setMessages(prev => [...prev, { role: "assistant", content: full }]);
        if (!open) setUnread(true);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Une erreur s'est produite. Réessaie dans un instant 🙏" },
      ]);
    } finally {
      setLoading(false);
      setStreaming("");
    }
  }, [messages, loading, context, open]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  // ── Rendu ────────────────────────────────────────────────────
  return (
    <>
      {/* ── Bouton flottant bas-gauche ──────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Assistant IA Yassala"
        title="Demander à l'IA"
        style={{
          position:   "fixed",
          bottom:     90,
          left:       14,
          zIndex:     1000,
          width:      44,
          height:     44,
          borderRadius: "50%",
          background: open
            ? "rgba(0,245,255,.12)"
            : "linear-gradient(135deg,#00f5ff,#0090b0)",
          border:     open ? "1px solid rgba(0,245,255,.4)" : "none",
          cursor:     "pointer",
          boxShadow:  open ? "none" : "0 4px 20px rgba(0,245,255,.4)",
          display:    "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize:   "1.1rem",
          transition: "all .25s",
        }}
      >
        {open
          ? <span style={{ color: "#00f5ff", fontWeight: 700, fontSize: "1rem" }}>✕</span>
          : <span>🤖</span>
        }
        {/* Pastille non-lu */}
        {unread && !open && (
          <span style={{
            position:   "absolute",
            top:        4,
            right:      4,
            width:      10,
            height:     10,
            background: "#ff2d78",
            borderRadius: "50%",
            border:     "2px solid #04020a",
          }} />
        )}
      </button>

      {/* ── Panneau chat ────────────────────────────────────── */}
      {open && (
        <div style={{
          position:   "fixed",
          bottom:     146,
          left:       14,
          zIndex:     999,
          width:      "min(350px, calc(100vw - 32px))",
          height:     "min(500px, calc(100vh - 120px))",
          background: "#0c0918",
          border:     "1px solid rgba(0,245,255,.25)",
          borderRadius: 14,
          display:    "flex",
          flexDirection: "column",
          overflow:   "hidden",
          boxShadow:  "0 8px 48px rgba(0,0,0,.65), 0 0 0 1px rgba(0,245,255,.08)",
          animation:  "aiChatIn .2s ease-out both",
        }}>

          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg,rgba(0,245,255,.12),rgba(0,144,176,.07))",
            borderBottom: "1px solid rgba(0,245,255,.18)",
            padding:    "11px 14px",
            display:    "flex",
            alignItems: "center",
            gap:        9,
            flexShrink: 0,
          }}>
            <div style={{
              width:  34, height: 34,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#00f5ff,#0090b0)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem", flexShrink: 0,
            }}>
              🤖
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Black Ops One',cursive",
                fontSize:   ".82rem",
                color:      "#00f5ff",
                letterSpacing: ".04em",
              }}>
                ASSISTANT IA
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize:   ".56rem",
                color:      "#5a5470",
                letterSpacing: ".1em",
              }}>
                Propulsé par Claude · {context.products.filter(p => p.stock > 0).length} produits en stock
              </div>
            </div>
            <span style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize:   ".56rem",
              color:      "#5a5470",
              textAlign:  "right",
              lineHeight: 1.4,
            }}>
              {context.shopOpen ? "🟢 Ouvert" : "🔴 Fermé"}<br />{context.hours}
            </span>
          </div>

          {/* Alerte clé API manquante */}
          {apiMissing && (
            <div style={{
              background: "rgba(255,45,120,.1)",
              border:     "1px solid rgba(255,45,120,.3)",
              margin:     "10px 12px 0",
              borderRadius: 8,
              padding:    "8px 12px",
              fontFamily: "'Share Tech Mono',monospace",
              fontSize:   ".62rem",
              color:      "#ff2d78",
              lineHeight: 1.5,
            }}>
              ⚠️ <strong>ANTHROPIC_API_KEY</strong> manquante.<br />
              Ajoute-la dans <code>.env.local</code> et redémarre.
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex:       1,
            overflowY:  "auto",
            padding:    "12px 10px",
            display:    "flex",
            flexDirection: "column",
            gap:        7,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0,245,255,.15) transparent",
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display:    "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth:    "84%",
                  padding:     "8px 12px",
                  borderRadius: m.role === "user"
                    ? "12px 12px 3px 12px"
                    : "12px 12px 12px 3px",
                  background: m.role === "user"
                    ? "linear-gradient(135deg,rgba(0,245,255,.2),rgba(0,245,255,.1))"
                    : "rgba(255,255,255,.05)",
                  border: m.role === "user"
                    ? "1px solid rgba(0,245,255,.3)"
                    : "1px solid rgba(255,255,255,.07)",
                  fontFamily:  "'Rajdhani',sans-serif",
                  fontSize:    ".86rem",
                  lineHeight:  1.5,
                  color:       "#f0eeff",
                  whiteSpace:  "pre-wrap",
                  wordBreak:   "break-word",
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {/* Streaming */}
            {streaming && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  maxWidth:    "84%",
                  padding:     "8px 12px",
                  borderRadius: "12px 12px 12px 3px",
                  background:  "rgba(255,255,255,.05)",
                  border:      "1px solid rgba(255,255,255,.07)",
                  fontFamily:  "'Rajdhani',sans-serif",
                  fontSize:    ".86rem",
                  lineHeight:  1.5,
                  color:       "#f0eeff",
                  whiteSpace:  "pre-wrap",
                  wordBreak:   "break-word",
                }}>
                  {streaming}
                  <span style={{
                    display: "inline-block", width: 5, height: 11,
                    background: "#00f5ff", marginLeft: 3,
                    verticalAlign: "middle",
                    animation: "aiCursor .65s step-end infinite",
                  }} />
                </div>
              </div>
            )}

            {/* Loader dots */}
            {loading && !streaming && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding:    "8px 14px",
                  borderRadius: "12px 12px 12px 3px",
                  background: "rgba(255,255,255,.05)",
                  border:     "1px solid rgba(255,255,255,.07)",
                  display:    "flex", gap: 5, alignItems: "center",
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#00f5ff", display: "inline-block",
                      animation: `aiDot .9s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Suggestions (première interaction) */}
          {messages.length === 1 && !loading && (
            <div style={{
              display:    "flex",
              gap:        5,
              flexWrap:   "wrap",
              padding:    "0 10px 8px",
              flexShrink: 0,
            }}>
              {QUICK_QUESTIONS.map(q => (
                <button key={q} onClick={() => send(q)} style={{
                  background:  "rgba(0,245,255,.07)",
                  border:      "1px solid rgba(0,245,255,.22)",
                  borderRadius: 20,
                  padding:     "4px 10px",
                  color:       "#00f5ff",
                  fontFamily:  "'Rajdhani',sans-serif",
                  fontSize:    ".73rem",
                  cursor:      "pointer",
                  whiteSpace:  "nowrap",
                }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding:    "9px 10px",
            borderTop:  "1px solid rgba(255,255,255,.06)",
            display:    "flex",
            gap:        7,
            flexShrink: 0,
            background: "rgba(4,2,10,.5)",
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Votre question…"
              disabled={loading}
              maxLength={500}
              style={{
                flex:       1,
                background: "rgba(255,255,255,.05)",
                border:     "1px solid rgba(255,255,255,.09)",
                borderRadius: 8,
                padding:    "8px 11px",
                color:      "#f0eeff",
                fontFamily: "'Rajdhani',sans-serif",
                fontSize:   ".86rem",
                outline:    "none",
                opacity:    loading ? .5 : 1,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                width:      36, height: 36,
                borderRadius: 8,
                background: loading || !input.trim()
                  ? "rgba(0,245,255,.12)"
                  : "#00f5ff",
                border:     "none",
                cursor:     loading || !input.trim() ? "not-allowed" : "pointer",
                color:      loading || !input.trim() ? "rgba(0,245,255,.35)" : "#000",
                fontSize:   "1rem",
                display:    "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "all .15s",
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes aiChatIn {
          from { opacity: 0; transform: translateY(10px) scale(.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes aiCursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes aiDot {
          0%, 80%, 100% { transform: scale(1);   opacity: .35; }
          40%           { transform: scale(1.45); opacity: 1;   }
        }
      `}</style>
    </>
  );
}
