import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type EmailType = "confirmation" | "en_route" | "delivered";

function buildEmail(type: EmailType, data: any): { subject: string; html: string } {
  const orderNum = data.orderNumber || "???";
  const trackingUrl = data.trackingUrl || "";

  const header = `
    <div style="background:linear-gradient(135deg,#0a0a12,#1a1030);padding:30px 24px;text-align:center;border-radius:12px 12px 0 0;">
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:900;letter-spacing:2px;
        background:linear-gradient(135deg,#00f5ff,#ff2d78);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
        YASSALA
      </div>
      <div style="color:#5a5470;font-size:11px;letter-spacing:3px;margin-top:4px;">NIGHT DELIVERY</div>
    </div>
  `;

  const footer = `
    <div style="background:#0a0a12;padding:20px 24px;text-align:center;border-radius:0 0 12px 12px;border-top:1px solid rgba(255,255,255,.06);">
      <div style="color:#5a5470;font-size:12px;font-family:Arial,sans-serif;">
        YASSALA Night Shop · Guyane Française
      </div>
    </div>
  `;

  if (type === "confirmation") {
    return {
      subject: `Commande #${orderNum} confirmée - YASSALA`,
      html: `
        <div style="max-width:500px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;background:#0f0f1a;border-radius:12px;overflow:hidden;">
          ${header}
          <div style="padding:28px 24px;">
            <div style="font-size:20px;font-weight:700;color:#f0eeff;margin-bottom:4px;">Commande confirmée !</div>
            <div style="color:#b8ff00;font-size:14px;font-weight:600;margin-bottom:20px;">Commande #${orderNum}</div>
            
            <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:16px;margin-bottom:16px;">
              <div style="color:#5a5470;font-size:11px;letter-spacing:2px;margin-bottom:8px;">RÉCAPITULATIF</div>
              <div style="color:#d0d0e0;font-size:14px;line-height:1.8;white-space:pre-line;">${data.items || ""}</div>
              <div style="border-top:1px solid rgba(255,255,255,.06);margin-top:12px;padding-top:12px;display:flex;justify-content:space-between;">
                <span style="color:#ff2d78;font-weight:700;font-size:16px;">TOTAL</span>
                <span style="color:#b8ff00;font-weight:700;font-size:16px;">${Number(data.total || 0).toFixed(2)}€</span>
              </div>
            </div>

            <div style="background:rgba(0,245,255,.06);border:1px solid rgba(0,245,255,.12);border-radius:8px;padding:14px;margin-bottom:16px;">
              <div style="color:#5a5470;font-size:11px;letter-spacing:2px;margin-bottom:6px;">${data.fulfillmentType === "pickup" ? "RETRAIT" : "LIVRAISON"}</div>
              <div style="color:#f0eeff;font-size:14px;">${data.fulfillmentType === "pickup" ? "🏪" : "📍"} ${data.address || ""}</div>
              <div style="color:#5a5470;font-size:13px;margin-top:4px;">💰 ${data.method === "cash" ? (data.fulfillmentType === "pickup" ? "Paiement cash au retrait" : "Paiement cash à la livraison") : "Payé en ligne"}</div>
            </div>

            ${trackingUrl ? `
              <a href="${trackingUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#00f5ff,#0090ff);
                color:#000;padding:14px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:1px;">
                📍 SUIVRE MA COMMANDE EN DIRECT
              </a>
            ` : ""}

            <div style="text-align:center;color:#5a5470;font-size:12px;margin-top:16px;">
              Merci pour ta commande ! On s'en occupe.
            </div>
          </div>
          ${footer}
        </div>
      `,
    };
  }

  if (type === "en_route") {
    return {
      subject: `Ton livreur est en route ! Commande #${orderNum} - YASSALA`,
      html: `
        <div style="max-width:500px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;background:#0f0f1a;border-radius:12px;overflow:hidden;">
          ${header}
          <div style="padding:28px 24px;">
            <div style="font-size:24px;text-align:center;margin-bottom:8px;">🏍️</div>
            <div style="font-size:20px;font-weight:700;color:#b8ff00;text-align:center;margin-bottom:4px;">Ton livreur est en route !</div>
            <div style="color:#5a5470;font-size:13px;text-align:center;margin-bottom:20px;">Commande #${orderNum}</div>

            ${data.driverName ? `
              <div style="background:rgba(0,245,255,.06);border:1px solid rgba(0,245,255,.12);border-radius:8px;padding:14px;margin-bottom:16px;text-align:center;">
                <div style="color:#00f5ff;font-weight:700;font-size:16px;">${data.driverName}</div>
                <div style="color:#5a5470;font-size:12px;margin-top:2px;">Ton livreur</div>
              </div>
            ` : ""}

            ${trackingUrl ? `
              <a href="${trackingUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#b8ff00,#7acc00);
                color:#000;padding:14px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:1px;">
                📍 VOIR MON LIVREUR EN DIRECT SUR LA CARTE
              </a>
            ` : ""}

            <div style="text-align:center;color:#5a5470;font-size:12px;margin-top:16px;">
              Tu peux suivre ton livreur en temps réel sur la carte !
            </div>
          </div>
          ${footer}
        </div>
      `,
    };
  }

  return {
    subject: `Commande #${orderNum} livrée - YASSALA`,
    html: `
      <div style="max-width:500px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;background:#0f0f1a;border-radius:12px;overflow:hidden;">
        ${header}
        <div style="padding:28px 24px;">
          <div style="font-size:24px;text-align:center;margin-bottom:8px;">✅</div>
          <div style="font-size:20px;font-weight:700;color:#b8ff00;text-align:center;margin-bottom:4px;">Commande livrée !</div>
          <div style="color:#5a5470;font-size:13px;text-align:center;margin-bottom:20px;">Commande #${orderNum}</div>

          <div style="background:rgba(184,255,0,.06);border:1px solid rgba(184,255,0,.15);border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">
            <div style="color:#f0eeff;font-size:15px;line-height:1.6;">
              Ta commande a bien été livrée.<br/>
              <span style="color:#b8ff00;font-weight:700;">Merci et bonne soirée !</span>
            </div>
          </div>

          <a href="${data.shopUrl || "/"}" style="display:block;text-align:center;background:linear-gradient(135deg,#ff2d78,#ff6b35);
            color:#fff;padding:14px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:1px;">
            COMMANDER À NOUVEAU
          </a>
        </div>
        ${footer}
      </div>
    `,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, email, ...data } = body;

    if (!email || !type) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { subject, html } = buildEmail(type as EmailType, data);

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "YASSALA <onboarding@resend.dev>",
      to: email,
      subject,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Email error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
