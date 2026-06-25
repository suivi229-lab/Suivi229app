import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUSINESS_NAME = "SUIVI 229 PLUS";
const BUSINESS_IFU = "0202243681345";
const BUSINESS_RCCM = "RB/COT/26 A 118065";
const BUSINESS_OWNER = "BOUKOUMI AKOFE SYLVAIN GBEFFAN";
const BUSINESS_ADDRESS = "Littoral, Cotonou, 12ème Arrondissement, Gbodjetin, Bénin";
const BUSINESS_PHONE = "+229 0155222939";
const BUSINESS_EMAIL = "suivi229@gmail.com";

interface InvoiceEmailRequest {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  totalAmount: number;
  lines: { description: string; quantity: number; unit_price: number; line_total: number }[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + " FCFA";
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function buildInvoiceHtml(req: InvoiceEmailRequest): string {
  const dateStr = formatDate(new Date());
  const linesHtml = req.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;">${l.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${l.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:right;">${formatCurrency(l.unit_price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:right;font-weight:600;">${formatCurrency(l.line_total)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:700px;margin:0 auto;color:#333;">
    <div style="text-align:center;padding-bottom:16px;border-bottom:3px solid #1d4ed8;margin-bottom:24px;">
      <h1 style="font-size:22px;font-weight:700;color:#1d4ed8;margin:0 0 4px;letter-spacing:1px;">${BUSINESS_NAME}</h1>
      <p style="font-size:11px;color:#555;margin:2px 0;">
        <strong>N° IFU :</strong> ${BUSINESS_IFU} | <strong>N° RCCM :</strong> ${BUSINESS_RCCM}
      </p>
      <p style="font-size:11px;color:#555;margin:2px 0;"><strong>Exploitant :</strong> ${BUSINESS_OWNER}</p>
      <p style="font-size:11px;color:#555;margin:2px 0;">${BUSINESS_ADDRESS}</p>
      <p style="font-size:11px;color:#555;margin:2px 0;">Tél : ${BUSINESS_PHONE} | Email : ${BUSINESS_EMAIL}</p>
    </div>

    <h2 style="font-size:18px;font-weight:600;margin:0 0 20px;">Facture ${req.invoiceNumber}</h2>

    <table style="width:100%;margin-bottom:12px;font-size:14px;">
      <tr><td style="color:#888;width:120px;">Client</td><td style="font-weight:600;">${req.clientName}</td></tr>
      <tr><td style="color:#888;">Date</td><td>${dateStr}</td></tr>
      <tr><td style="color:#888;">Statut</td><td style="color:#059669;font-weight:600;">Payée</td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;">Qté</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;">Prix unitaire</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml}
      </tbody>
    </table>

    <div style="text-align:right;font-size:18px;font-weight:700;border-top:3px solid #111;padding-top:12px;margin-top:8px;">
      Total : ${formatCurrency(req.totalAmount)}
    </div>

    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #ddd;text-align:center;font-size:12px;color:#999;">
      Merci pour votre confiance — ${BUSINESS_NAME}
    </div>
  </div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: InvoiceEmailRequest = await req.json();

    if (!body.clientEmail || !body.invoiceNumber || !body.clientName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: clientEmail, invoiceNumber, clientName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = buildInvoiceHtml(body);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${BUSINESS_NAME} <${BUSINESS_EMAIL}>`,
        to: [body.clientEmail],
        subject: `Facture ${body.invoiceNumber} — ${BUSINESS_NAME}`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error("Resend API error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await emailResponse.json();
    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
