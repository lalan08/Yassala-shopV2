import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#04020a;color:#f0eeff;font-family:'Rajdhani',sans-serif;min-height:100vh;}
        @keyframes flicker{0%,95%,100%{opacity:1;}96%{opacity:.6;}97%{opacity:1;}98%{opacity:.4;}99%{opacity:1;}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.4);}}
        .flicker{animation:flicker 4s infinite;}
      `}</style>

      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:"40px 20px",textAlign:"center",
        background:"radial-gradient(ellipse 60% 50% at 50% 40%,rgba(255,45,120,.07) 0%,transparent 70%)"}}>

        <div className="flicker" style={{fontFamily:"'Black Ops One',cursive",
          fontSize:"clamp(6rem,20vw,12rem)",lineHeight:1,
          color:"#ff2d78",textShadow:"0 0 40px rgba(255,45,120,.5),0 0 80px rgba(255,45,120,.2)",
          marginBottom:8,animation:"flicker 3s infinite, fadeUp .5s both"}}>
          404
        </div>

        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",
          letterSpacing:".2em",marginBottom:20,animation:"fadeUp .5s .1s both"}}>
          // PAGE INTROUVABLE
        </div>

        <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:"1.1rem",color:"#a09ab8",
          maxWidth:340,lineHeight:1.7,marginBottom:36,animation:"fadeUp .5s .2s both"}}>
          Oups ! Cette page n'existe pas.<br/>
          Peut-être que tu as besoin d'une bière pour te consoler 🍺
        </div>

        <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center",
          animation:"fadeUp .5s .3s both"}}>
          <Link href="/"
            style={{padding:"13px 28px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
              fontSize:".9rem",letterSpacing:".12em",textTransform:"uppercase",border:"none",
              cursor:"pointer",borderRadius:3,background:"#ff2d78",color:"#000",textDecoration:"none",
              display:"inline-block"}}>
            ← RETOUR AU SHOP
          </Link>
          <Link href="/suivi"
            style={{padding:"13px 28px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
              fontSize:".9rem",letterSpacing:".12em",textTransform:"uppercase",
              background:"transparent",color:"#00f5ff",border:"1px solid #00f5ff",
              cursor:"pointer",borderRadius:3,textDecoration:"none",display:"inline-block"}}>
            🔎 SUIVRE MA COMMANDE
          </Link>
        </div>

        <div style={{position:"fixed",inset:0,pointerEvents:"none",
          background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 4px)",
          zIndex:1}} />
      </div>
    </>
  );
}
