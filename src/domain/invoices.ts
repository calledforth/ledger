import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { charges } from "@/db/schema";
import { blankToNull } from "@/lib/sanitize";
import { DomainError } from "./errors";
import { getCharge } from "./charges";
import { chargeJson } from "./serialize";

export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

export type BlobPut = (pathname: string, body: Buffer, opts: { contentType: string }) => Promise<{ url: string }>;

export type AttachInvoiceInput = {
  charge_id: string;
  invoice_number?: string | null;
  pdf_base64?: string;
  filename?: string;
  upload_url?: string;
  overwrite?: boolean;
};

async function defaultPut(pathname: string, body: Buffer, opts: { contentType: string }) {
  const { put } = await import("@vercel/blob");
  // Public store, but the path carries 128 bits of randomness so URLs are unguessable.
  return put(pathname, body, { access: "public", contentType: opts.contentType, addRandomSuffix: false });
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return h.includes(":");
  return false;
}

async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DomainError("invalid_input", "upload_url is not a valid URL");
  }
  if (u.protocol !== "https:") throw new DomainError("invalid_input", "upload_url must use https");
  if (isPrivateHost(u.hostname)) throw new DomainError("invalid_input", "upload_url points at a private or local address");
  const res = await fetchImpl(u, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new DomainError("upstream_error", `Downloading upload_url failed with HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/application\/(pdf|x-pdf|octet-stream)/i.test(type))
    throw new DomainError("invalid_input", `upload_url returned content-type "${type}", expected application/pdf`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_INVOICE_BYTES) throw new DomainError("invalid_input", `PDF is ${len} bytes; the limit is ${MAX_INVOICE_BYTES}`);
  const reader = res.body?.getReader();
  if (!reader) throw new DomainError("upstream_error", "upload_url returned no body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INVOICE_BYTES) {
      await reader.cancel();
      throw new DomainError("invalid_input", `PDF exceeds ${MAX_INVOICE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Store an invoice PDF in Vercel Blob and record its URL (and invoice_number) on the charge.
 * Idempotent per charge + invoice_number: if the charge already has a PDF for the same invoice number, nothing is
 * uploaded again. A different invoice number on a charge that already has a PDF needs overwrite: true.
 */
export async function attachInvoice(db: Db, input: AttachInvoiceInput, deps: { put?: BlobPut; fetch?: typeof fetch } = {}) {
  const charge = await getCharge(db, input.charge_id);
  const invoiceNumber = blankToNull(input.invoice_number) ?? charge.invoiceNumber;
  if (charge.pdfUrl && !input.overwrite) {
    if (!invoiceNumber || invoiceNumber === charge.invoiceNumber)
      return { status: "existing", charge: chargeJson(charge), pdf_url: charge.pdfUrl };
    throw new DomainError("conflict", `Charge already has a PDF for invoice ${charge.invoiceNumber ?? "(none)"}. Pass overwrite: true to replace it.`);
  }
  if (!!input.pdf_base64 === !!input.upload_url) throw new DomainError("invalid_input", "Provide exactly one of pdf_base64 or upload_url");

  let pdf: Buffer;
  if (input.pdf_base64) {
    const b64 = input.pdf_base64.replace(/^data:application\/pdf;base64,/, "").replace(/\s+/g, "");
    if (b64.length > Math.ceil((MAX_INVOICE_BYTES * 4) / 3) + 4) throw new DomainError("invalid_input", `PDF exceeds ${MAX_INVOICE_BYTES} bytes`);
    pdf = Buffer.from(b64, "base64");
  } else {
    pdf = await download(input.upload_url!, deps.fetch ?? fetch);
  }
  if (pdf.length === 0 || pdf.subarray(0, 5).toString("latin1") !== "%PDF-")
    throw new DomainError("invalid_input", "The file is not a PDF (missing %PDF- header)");

  const safeName = (input.filename ?? invoiceNumber ?? "invoice").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/\.pdf$/i, "").slice(0, 60);
  const pathname = `invoices/${charge.id}/${randomBytes(16).toString("hex")}/${safeName}.pdf`;
  const { url } = await (deps.put ?? defaultPut)(pathname, pdf, { contentType: "application/pdf" });
  const [row] = await db.update(charges).set({ pdfUrl: url, invoiceNumber }).where(eq(charges.id, charge.id)).returning();
  return { status: "attached", charge: chargeJson(row), pdf_url: url, bytes: pdf.length };
}
