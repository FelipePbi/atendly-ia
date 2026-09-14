import clsx from "clsx";

import { Icon } from "@/shared/icons/Icon";

export type ToastTone = "neutral" | "success" | "danger";

type ToastProps = {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
};

const toneClassName: Record<ToastTone, string> = {
  neutral: "toast",
  success: "toast toast-success",
  danger: "toast toast-danger",
};

const toneIcon: Record<ToastTone, "check" | "alert" | "info"> = {
  neutral: "info",
  success: "check",
  danger: "alert",
};

export function Toast({ message, tone = "neutral", onDismiss }: ToastProps) {
  return (
    <div className={clsx(toneClassName[tone])} role="status" aria-live="polite">
      <Icon name={toneIcon[tone]} />
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="toast-dismiss"
          onClick={onDismiss}
          aria-label="Fechar aviso"
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}
