'use client';

import React from 'react';
import Link from 'next/link';

export default function SuccesPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#04020a',
        color: '#f0eeff',
        fontFamily: "'Rajdhani', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.6;transform:scale(1.08);} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
        .fade1{animation:fadeUp .5s .0s both;}
        .fade2{animation:fadeUp .5s .2s both;}
        .fade3{animation:fadeUp .5s .4s both;}
      `}</style>

      <div
        className="fade1"
        style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          border: '3px solid #b8ff00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
          boxShadow: '0 0 30px rgba(184,255,0,.3)',
          animation: 'pulse 2s infinite',
        }}
      >
        <span style={{ fontSize: '2.5rem' }}>✅</span>
      </div>

      <h1
        className="fade1"
        style={{
          fontFamily: "'Black Ops One', cursive",
          fontSize: 'clamp(2rem, 6vw, 3.5rem)',
          color: '#b8ff00',
          textShadow: '0 0 20px rgba(184,255,0,.5)',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        PAIEMENT CONFIRMÉ !
      </h1>

      <p
        className="fade2"
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          color: '#00f5ff',
          fontSize: '.85rem',
          letterSpacing: '.15em',
          marginBottom: 36,
          textAlign: 'center',
        }}
      >
        // ton livreur est en route
      </p>

      <div
        className="fade2"
        style={{
          background: 'rgba(0,245,255,.05)',
          border: '1px solid rgba(0,245,255,.2)',
          borderRadius: 6,
          padding: '20px 24px',
          maxWidth: 440,
          width: '100%',
          marginBottom: 32,
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '.78rem',
          color: '#00f5ff',
          lineHeight: 1.9,
          textAlign: 'center',
        }}
      >
        📲 Tu recevras une confirmation par SMS<br />
        🚴 Ton livreur part dans quelques minutes<br />
        ⏱️ Délai estimé : 20–40 minutes
      </div>

      <div className="fade3">
        <Link href="/">
          <button
            style={{
              padding: '14px 32px',
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: '1rem',
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              border: '1px solid #00f5ff',
              background: 'transparent',
              color: '#00f5ff',
              cursor: 'pointer',
              borderRadius: 3,
            }}
          >
            RETOUR À L'ACCUEIL
          </button>
        </Link>
      </div>
    </div>
  );
}
