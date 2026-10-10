import { describe, expect, it, vi } from "vitest";
import { addCharge } from "@/domain/charges";
import { attachInvoice } from "@/domain/invoices";
import { db, msgId } from "./helpers";

const pdf = Buffer.from("%PDF-1.4\n% test\n").toString("base64");

describe("attach_invoice", () => {
  it("stores base64 PDFs at an unguessable path and is idempotent per invoice number", async () => {
    const c = await addCharge(db(), { amount: 10, currency: "USD", charged_at: "2026-10-01T10:00", source: "manual", vendor: "Notion" });
    const put = vi.fn(async (path: string) => ({ url: `https://blob.example/${path}` }));
    const a = await attachInvoice(db(), { charge_id: c.charge.id, invoice_number: "INV-1", pdf_base64: pdf }, { put });
    expect(a.status).toBe("attached");
    expect(put.mock.calls[0][0]).toMatch(new RegExp(`^invoices/${c.charge.id}/[0-9a-f]{32}/INV-1\\.pdf$`));
    const b = await attachInvoice(db(), { charge_id: c.charge.id, invoice_number: "INV-1", pdf_base64: pdf }, { put });
    expect(b.status).toBe("existing");
    expect(put).toHaveBeenCalledTimes(1);
    await expect(attachInvoice(db(), { charge_id: c.charge.id, invoice_number: "INV-2", pdf_base64: pdf }, { put })).rejects.toThrow(/overwrite/);
  });

  it("rejects non-PDFs, http URLs and private hosts", async () => {
    const c = await addCharge(db(), { amount: 10, currency: "USD", charged_at: "2026-10-01T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "X" });
    const put = vi.fn();
    await expect(attachInvoice(db(), { charge_id: c.charge.id, pdf_base64: Buffer.from("hello").toString("base64") }, { put })).rejects.toThrow(/not a PDF/);
    await expect(attachInvoice(db(), { charge_id: c.charge.id, upload_url: "http://example.com/a.pdf" }, { put })).rejects.toThrow(/https/);
    await expect(attachInvoice(db(), { charge_id: c.charge.id, upload_url: "https://127.0.0.1/a.pdf" }, { put })).rejects.toThrow(/private/);
    const fetchImpl = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await expect(attachInvoice(db(), { charge_id: c.charge.id, upload_url: "https://example.com/a.pdf" }, { put, fetch: fetchImpl })).rejects.toThrow(/content-type/);
    const okFetch = vi.fn(async () => new Response(Buffer.from("%PDF-1.7 x"), { headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    put.mockResolvedValue({ url: "https://blob.example/x.pdf" });
    const r = await attachInvoice(db(), { charge_id: c.charge.id, upload_url: "https://example.com/a.pdf" }, { put, fetch: okFetch });
    expect(r.status).toBe("attached");
  });
});
