import { QrCode, RotateCcw } from "lucide-react";

export function QrCodePanel({
  qrcode,
  expired,
  loading,
  onRefresh,
  compact = false,
}: {
  qrcode: string | null;
  expired: boolean;
  loading: boolean;
  onRefresh: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "min-w-0" : "rounded-lg border border-border bg-surface p-4"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">QR Code</h2>
          <p className={compact ? "mt-0.5 text-sm leading-5 text-muted" : "mt-1 text-sm leading-6 text-muted"}>
            Escaneie com o WhatsApp do celular.
          </p>
        </div>
        <QrCode className={compact ? "h-6 w-6 text-brand" : "h-7 w-7 text-brand"} aria-hidden="true" />
      </div>

      <div
        className={
          compact
            ? "mt-3 flex h-[min(58vw,22rem)] min-h-[190px] w-full items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted p-3 sm:h-[min(42vw,22rem)] lg:h-[min(34vw,22rem)]"
            : "mt-5 flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted p-4"
        }
      >
        {qrcode && qrcode.startsWith("data:image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="h-full w-full object-contain" src={qrcode} alt="QR Code para conectar WhatsApp" />
        ) : qrcode ? (
          <div className="max-h-full overflow-auto break-all rounded-md bg-white p-3 font-mono text-xs text-foreground sm:p-4">
            {qrcode}
          </div>
        ) : (
          <div className="text-center text-sm text-muted">{loading ? "Gerando QR Code..." : "QR Code indisponivel."}</div>
        )}
      </div>

      {expired ? (
        <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning sm:mt-3">
          QR Code expirado. Gere um novo codigo para continuar.
        </p>
      ) : null}

      <button
        className={
          compact
            ? "mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
            : "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
        }
        type="button"
        onClick={onRefresh}
        disabled={loading}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Gerar novo QR Code
      </button>
    </div>
  );
}
