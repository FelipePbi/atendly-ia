import { QrCode, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    <div className="qr-panel" data-compact={compact}>
      <div className="qr-panel__header">
        <div>
          <h2 className="qr-panel__title">QR Code</h2>
          <p className="qr-panel__description">Escaneie com o WhatsApp do celular.</p>
        </div>
        <QrCode className="qr-panel__icon" aria-hidden="true" />
      </div>

      <div className="qr-panel__code">
        {qrcode && qrcode.startsWith("data:image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="qr-panel__image" src={qrcode} alt="QR Code para conectar WhatsApp" />
        ) : qrcode ? (
          <div className="qr-panel__raw">{qrcode}</div>
        ) : (
          <div className="qr-panel__empty">{loading ? "Gerando QR Code..." : "QR Code indisponível."}</div>
        )}
      </div>

      {expired ? (
        <p className="qr-panel__warning">
          QR Code expirado. Gere um novo código para continuar.
        </p>
      ) : null}

      {compact ? <p className="qr-panel__hint">Código atualizado automaticamente</p> : null}

      <Button
        className="qr-panel__refresh"
        variant="secondary"
        fullWidth
        type="button"
        onClick={onRefresh}
        disabled={loading}
        icon={<RotateCcw aria-hidden="true" />}
      >
        Gerar novo QR Code
      </Button>
    </div>
  );
}
