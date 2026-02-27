"use client";

import { useState, useRef, useCallback } from "react";

type Product = { id: string; name: string; price: number; stock: number };
type CartItem = { id: string; name: string; price: number; qty: number };

interface Props {
  products: Product[];
  onAddItems: (items: CartItem[]) => void;
}

type State = "idle" | "listening" | "processing" | "done" | "error";

// Typage minimal pour Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: { [key: number]: { [key: number]: { transcript: string } } };
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export default function VoiceOrderButton({ products, onAddItems }: Props) {
  const [state, setState]     = useState<State>("idle");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition!;
    const rec = new SR();
    rec.lang             = "fr-FR";
    rec.interimResults   = false;
    rec.maxAlternatives  = 1;
    recognitionRef.current = rec;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      setState("processing");
      sendToAPI(text);
    };

    rec.onerror = () => {
      setState("error");
      setMessage("Micro inaccessible — vérifie les permissions.");
    };

    rec.onend = () => {
      if (state === "listening") setState("idle");
    };

    rec.start();
    setState("listening");
    setTranscript("");
    setMessage("");
  }, [isSupported, state]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  const sendToAPI = async (text: string) => {
    try {
      const res = await fetch("/api/voice-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          products:   products
            .filter(p => p.stock > 0)
            .map(p => ({ id: p.id, name: p.name, price: p.price, stock: p.stock })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.items) {
        setState("error");
        setMessage(data.error ?? "Erreur lors de l'analyse.");
        return;
      }

      if (data.items.length > 0) {
        onAddItems(data.items);
      }

      setState("done");
      setMessage(data.message ?? "Commande analysée !");

      // Reset après 4 s
      setTimeout(() => {
        setState("idle");
        setTranscript("");
        setMessage("");
      }, 4000);
    } catch {
      setState("error");
      setMessage("Erreur réseau.");
    }
  };

  if (!isSupported) return null;

  const isListening   = state === "listening";
  const isProcessing  = state === "processing";
  const isDone        = state === "done";
  const isError       = state === "error";
  const busy          = isListening || isProcessing;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {/* Bouton micro */}
      <button
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing}
        title="Commander par la voix"
        style={{
          display:         "flex",
          alignItems:      "center",
          gap:             8,
          padding:         "10px 18px",
          borderRadius:    "999px",
          border:          `2px solid ${isListening ? "#ff2d78" : isError ? "#ff2d78" : isDone ? "#00f5ff" : "rgba(255,255,255,.2)"}`,
          background:      isListening
            ? "rgba(255,45,120,.12)"
            : isProcessing
            ? "rgba(0,245,255,.06)"
            : "rgba(255,255,255,.04)",
          color:           isListening ? "#ff2d78" : "#f0eeff",
          fontSize:        ".85rem",
          fontFamily:      "'Rajdhani', sans-serif",
          fontWeight:      600,
          cursor:          isProcessing ? "wait" : "pointer",
          transition:      "all .2s",
          animation:       isListening ? "pulse-mic 1s ease-in-out infinite" : "none",
        }}
      >
        {/* Icône micro SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8"  y1="23" x2="16" y2="23"/>
        </svg>
        {isListening   && "J'écoute…"}
        {isProcessing  && "Analyse…"}
        {isDone        && "Ajouté !"}
        {isError       && "Erreur"}
        {state === "idle" && "Commander par la voix"}
      </button>

      {/* Transcript */}
      {transcript && (
        <div style={{
          fontSize:    ".75rem",
          color:       "#7a7490",
          fontStyle:   "italic",
          maxWidth:    280,
          textAlign:   "center",
        }}>
          « {transcript} »
        </div>
      )}

      {/* Message retour */}
      {message && (
        <div style={{
          fontSize:     ".8rem",
          color:        isError ? "#ff2d78" : "#00f5ff",
          fontWeight:   600,
          maxWidth:     300,
          textAlign:    "center",
        }}>
          {message}
        </div>
      )}

      <style>{`
        @keyframes pulse-mic {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,45,120,.4); }
          50%       { box-shadow: 0 0 0 8px rgba(255,45,120,0); }
        }
      `}</style>
    </div>
  );
}
