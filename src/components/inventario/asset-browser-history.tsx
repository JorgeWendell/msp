"use client";

import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatAssetDate } from "@/config/inventario";

export type BrowserHistoryItem = {
  browser?: string;
  url?: string;
  title?: string | null;
  visitedAt?: string;
  windowsUser?: string | null;
};

function isSameLocalDay(iso: string, now: Date) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === now.toDateString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sortedItems(items: BrowserHistoryItem[]) {
  return [...items].sort((a, b) => {
    const left = new Date(a.visitedAt ?? 0).getTime();
    const right = new Date(b.visitedAt ?? 0).getTime();
    return right - left;
  });
}

function exportWeekPdf(hostname: string, items: BrowserHistoryItem[]) {
  const rows = sortedItems(items)
    .map((item) => {
      const when = item.visitedAt ? formatAssetDate(item.visitedAt) : "—";
      const title = escapeHtml(item.title?.trim() || item.url || "—");
      const url = escapeHtml(item.url ?? "");
      const browser = escapeHtml(item.browser ?? "—");
      const user = escapeHtml(item.windowsUser ?? "—");
      return `<tr>
        <td>${when}</td>
        <td>${browser}</td>
        <td>${user}</td>
        <td>${title}<br/><span style="color:#64748b;word-break:break-all">${url}</span></td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Histórico — ${escapeHtml(hostname)}</title>
  <style>
    body { font-family: Segoe UI, sans-serif; font-size: 12px; color: #0f172a; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { color: #64748b; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
  </style>
</head>
<body>
  <h1>Histórico do navegador — ${escapeHtml(hostname)}</h1>
  <p>Chrome e Edge, todos os perfis, últimos 7 dias. Gerado em ${escapeHtml(formatAssetDate(new Date()))}.</p>
  <table>
    <thead>
      <tr><th>Quando</th><th>Navegador</th><th>Usuário</th><th>Página</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="4">Nenhum registro nos últimos 7 dias.</td></tr>`}</tbody>
  </table>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

export function AssetBrowserHistory({
  hostname,
  items,
  hasInventory,
}: {
  hostname: string;
  items: BrowserHistoryItem[];
  hasInventory: boolean;
}) {
  const todayItems = sortedItems(items).filter((item) =>
    item.visitedAt ? isSameLocalDay(item.visitedAt, new Date()) : false
  );

  if (!hasInventory) {
    return (
      <div className="overflow-hidden rounded-xl border px-3 py-8 text-center text-sm text-muted-foreground">
        Ainda não há inventário do agente nesta máquina.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Histórico de hoje do Chrome e do Edge, todos os perfis juntos.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-9 px-3"
          onClick={() => exportWeekPdf(hostname, items)}
        >
          <FileDown />
          Exportar PDF (7 dias)
        </Button>
      </div>
      {todayItems.length === 0 ? (
        <div className="overflow-hidden rounded-xl border px-3 py-8 text-center text-sm text-muted-foreground">
          Nenhum acesso hoje. Atualize o agente para passar a enviar o histórico, ou exporte os
          últimos 7 dias se já houver coleta.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Hora</th>
                <th className="px-3 py-2.5 font-medium">Navegador</th>
                <th className="px-3 py-2.5 font-medium">Usuário</th>
                <th className="px-3 py-2.5 font-medium">Página</th>
              </tr>
            </thead>
            <tbody>
              {todayItems.map((item, index) => (
                <tr key={`${item.url}-${item.visitedAt}-${index}`} className="border-t">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {item.visitedAt ? formatAssetDate(item.visitedAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5">{item.browser || "—"}</td>
                  <td className="px-3 py-2.5">{item.windowsUser || "—"}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{item.title?.trim() || item.url || "—"}</p>
                    <p className="break-all text-xs text-muted-foreground">{item.url}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
