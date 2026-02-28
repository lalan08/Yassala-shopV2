'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

function ConfirmContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('id') || '';

  const [digits, setDigits] = useState(['', '', '', '']);
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(db, 'orders', orderId), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setOrder(data);
        if (data.status === 'confirmed') setConfirmed(true);
        if (data.otpExpiry && new Date() > new Date(data.otpExpiry)) {
          setExpired(true);
        }
      }
    });
    return () => unsub();
  }, [orderId]);

  const handleDigit = (idx: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = v;
    setDigits(next);
    setError('');
    if (v && idx < 3) inputRefs[idx + 1].current?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs[idx - 1].current?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== 4) { setError('Saisis les 4 chiffres du code.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmed(true);
      } else if (data.expired) {
        setExpired(true);
        setError('Code expiré. Demande un nouveau code à l\'admin.');
      } else {
        setError(data.error || 'Code incorrect.');
        setDigits(['', '', '', '']);
        inputRefs[0].current?.focus();
      }
    } catch {
      setError('Erreur réseau. Réessaie.');
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setResending(true);
    setResent(false);
    try {
      const res = await fetch('/api/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (res.ok) {
        setResent(true);
        setExpired(false);
        setError('');
        setDigits(['', '', '', '']);
        inputRefs[0].current?.focus();
      }
    } catch {}
    setResending(false);
  };

  const S = {
    page: {
      minHeight: '100vh',
      background: '#04020a',
      color: '#f0eeff',
      fontFamily: "'Rajdhani', sans-serif",
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    },
    card: {
      background: '#0c0918',
      border: '1px solid rgba(255,45,120,.25)',
      borderRadius: 14,
      padding: '36px 28px',
      maxWidth: 420,
      width: '100%',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 20,
      animation: 'fadeUp .4s both',
    },
    title: {
      fontFamily: "'Black Ops One', cursive",
      fontSize: '1.5rem',
      color: '#ff2d78',
      letterSpacing: '.04em',
      textAlign: 'center' as const,
    },
    subtitle: {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '.72rem',
      color: '#7a7490',
      letterSpacing: '.06em',
      lineHeight: 1.7,
      textAlign: 'center' as const,
    },
    digitRow: {
      display: 'flex',
      gap: 10,
      justifyContent: 'center',
    },
    digitInput: (filled: boolean) => ({
      width: 64,
      height: 72,
      background: '#080514',
      border: `2px solid ${filled ? '#ff2d78' : 'rgba(255,45,120,.2)'}`,
      borderRadius: 10,
      color: '#ff2d78',
      fontFamily: "'Black Ops One', cursive",
      fontSize: '2rem',
      textAlign: 'center' as const,
      outline: 'none',
      transition: 'border-color .15s',
    }),
    btn: (disabled: boolean) => ({
      background: disabled ? '#2a2440' : '#ff2d78',
      color: disabled ? '#5a5470' : '#000',
      border: 'none',
      borderRadius: 10,
      padding: '15px',
      fontFamily: "'Rajdhani', sans-serif",
      fontWeight: 700,
      fontSize: '1rem',
      letterSpacing: '.08em',
      textTransform: 'uppercase' as const,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background .2s',
    }),
    error: {
      background: 'rgba(255,45,120,.1)',
      border: '1px solid rgba(255,45,120,.25)',
      borderRadius: 8,
      padding: '10px 14px',
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '.74rem',
      color: '#ff2d78',
      textAlign: 'center' as const,
    },
    resendBtn: {
      background: 'transparent',
      border: '1px solid rgba(0,245,255,.25)',
      color: '#00f5ff',
      borderRadius: 8,
      padding: '10px',
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '.78rem',
      letterSpacing: '.06em',
      cursor: 'pointer',
      transition: 'border-color .2s',
    },
    successTitle: {
      fontFamily: "'Black Ops One', cursive",
      fontSize: '2rem',
      color: '#b8ff00',
      textShadow: '0 0 20px rgba(184,255,0,.5)',
      textAlign: 'center' as const,
    },
  };

  if (!orderId) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.title}>LIEN INVALIDE</div>
          <div style={S.subtitle}>Ce lien de confirmation est invalide.</div>
          <a href="/" style={{...S.btn(false), display:'block', textAlign:'center', textDecoration:'none'}}>
            RETOUR À L'ACCUEIL
          </a>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div style={S.page}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
          @keyframes fadeUp { from{opacity:0;transform:translateY(18px);} to{opacity:1;transform:translateY(0);} }
          @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.6;transform:scale(1.08);} }
        `}</style>
        <div style={{...S.card, border:'1px solid rgba(184,255,0,.25)', textAlign:'center', gap:18}}>
          <div style={{width:80,height:80,borderRadius:'50%',border:'3px solid #b8ff00',display:'flex',
            alignItems:'center',justifyContent:'center',margin:'0 auto',
            boxShadow:'0 0 30px rgba(184,255,0,.3)',animation:'pulse 2s infinite'}}>
            <span style={{fontSize:'2.2rem'}}>✅</span>
          </div>
          <div style={S.successTitle}>COMMANDE CONFIRMÉE !</div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'.72rem',color:'#00f5ff',
            lineHeight:1.8,letterSpacing:'.05em'}}>
            {order?.orderNumber ? `Commande #${order.orderNumber}` : 'Ta commande est confirmée.'}<br/>
            🚴 Ton livreur est en route<br/>
            ⏱️ Délai estimé : 20–40 minutes
          </div>
          <a href={`/suivi?id=${orderId}`}
            style={{display:'block',background:'#b8ff00',color:'#000',borderRadius:4,padding:'13px',
              fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:'.95rem',letterSpacing:'.1em',
              textTransform:'uppercase',textDecoration:'none',marginTop:4}}>
            SUIVRE MA COMMANDE
          </a>
          <a href="/" style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'.7rem',
            color:'#5a5470',textDecoration:'underline',cursor:'pointer'}}>
            Retour à l'accueil
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px);} to{opacity:1;transform:translateY(0);} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; }
        input[type=number] { -moz-appearance:textfield; }
      `}</style>

      <div style={S.card}>
        {/* Icon */}
        <div style={{width:60,height:60,borderRadius:'50%',border:'2px solid rgba(255,45,120,.4)',
          display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',
          background:'rgba(255,45,120,.06)'}}>
          <span style={{fontSize:'1.6rem'}}>🔐</span>
        </div>

        <div style={S.title}>CODE DE CONFIRMATION</div>

        <div style={S.subtitle}>
          Un code à 4 chiffres t'a été envoyé par{' '}
          <span style={{color:'#25d366',fontWeight:700}}>WhatsApp</span>
          {order?.phone && (
            <> au numéro <span style={{color:'#f0eeff'}}>{order.phone}</span></>
          )}
          .<br/>
          Saisis-le ci-dessous pour confirmer ta commande.
        </div>

        {/* Order number badge */}
        {order?.orderNumber && (
          <div style={{background:'rgba(255,45,120,.08)',border:'1px solid rgba(255,45,120,.15)',
            borderRadius:8,padding:'8px 14px',textAlign:'center',
            fontFamily:"'Share Tech Mono',monospace",fontSize:'.72rem',color:'#5a5470',letterSpacing:'.08em'}}>
            COMMANDE <span style={{color:'#ff2d78',fontFamily:"'Black Ops One',cursive",fontSize:'.9rem"}}>
              #{order.orderNumber}
            </span>
          </div>
        )}

        {/* OTP digits */}
        <div style={S.digitRow}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="number"
              inputMode="numeric"
              maxLength={1}
              value={d}
              autoFocus={i === 0}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={S.digitInput(!!d)}
              disabled={loading || expired}
            />
          ))}
        </div>

        {/* Error */}
        {error && <div style={S.error}>{error}</div>}

        {/* Resent success */}
        {resent && (
          <div style={{...S.error, background:'rgba(37,211,102,.08)',border:'1px solid rgba(37,211,102,.2)',color:'#25d366'}}>
            Nouveau code généré — l'admin va te l'envoyer par WhatsApp.
          </div>
        )}

        {/* Actions */}
        {expired ? (
          <button onClick={handleResend} disabled={resending} style={S.resendBtn}>
            {resending ? 'GÉNÉRATION...' : '🔄 DEMANDER UN NOUVEAU CODE'}
          </button>
        ) : (
          <button
            onClick={handleVerify}
            disabled={loading || digits.join('').length !== 4}
            style={S.btn(loading || digits.join('').length !== 4)}
          >
            {loading ? 'VÉRIFICATION...' : '✓ CONFIRMER MA COMMANDE'}
          </button>
        )}

        {/* Resend link (before expiry) */}
        {!expired && (
          <div style={{textAlign:'center'}}>
            <button onClick={handleResend} disabled={resending}
              style={{background:'transparent',border:'none',color:'#5a5470',cursor:'pointer',
                fontFamily:"'Share Tech Mono',monospace",fontSize:'.68rem',
                textDecoration:'underline',letterSpacing:'.04em'}}>
              {resending ? 'génération en cours...' : 'Code non reçu ? Renvoyer'}
            </button>
          </div>
        )}

        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'.62rem',
          color:'#3a3455',textAlign:'center',lineHeight:1.6,letterSpacing:'.04em'}}>
          Le code est valide 15 minutes. L'admin l'envoie manuellement via WhatsApp.
        </div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  );
}
