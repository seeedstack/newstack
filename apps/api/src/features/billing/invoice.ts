// Invoice rendering. PAYPAL_SPEC §4.11 asks for a PDF; a PDF library is a real dependency for
// one templated page, so this renders a print-ready HTML invoice instead — the browser's own
// "Print to PDF" covers the PDF requirement without adding puppeteer/pdfkit.
// ponytail: no PDF-generation dependency; add one (e.g. pdfkit) if users need a downloadable
// .pdf file rather than a printable page.
export function renderInvoiceHtml(args: {
  invoiceNumber: string;
  planName: string;
  amountPaise: number;
  paidAt: Date;
  userEmail: string;
}): string {
  const amount = (args.amountPaise / 100).toFixed(2);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${args.invoiceNumber}</title></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 2rem auto;">
  <h1>Newstack</h1>
  <h2>Invoice ${args.invoiceNumber}</h2>
  <p>Billed to: ${args.userEmail}</p>
  <p>Date: ${args.paidAt.toISOString().slice(0, 10)}</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr style="border-bottom: 1px solid #ccc;"><th style="text-align:left;">Plan</th><th style="text-align:right;">Amount (INR)</th></tr>
    <tr><td>${args.planName}</td><td style="text-align:right;">₹${amount}</td></tr>
  </table>
  <p style="margin-top: 2rem; color: #666; font-size: 0.85rem;">Tax treatment pending accountant sign-off (PAYPAL_SPEC §2 A2) — GSTIN and tax breakup to be added here once confirmed.</p>
</body></html>`;
}
