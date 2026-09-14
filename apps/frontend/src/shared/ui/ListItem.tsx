import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

type CommonProps = {
  leading?: ReactNode;
  title: ReactNode;
  copy?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  disabled?: boolean;
};
type StaticProps = CommonProps & { href?: never; onClick?: never };
type LinkProps = CommonProps & { href: string; onClick?: never };
type ButtonProps = CommonProps & { href?: never; onClick: () => void };

/**
 * Dentro de `role="list"` cada item precisa ser um `listitem`, mas o papel
 * nunca vai no link nem no botão: ali ele apagaria os papéis implícitos de
 * link e de botão, tirando o item da navegação por links e do anúncio de
 * ação. O invólucro carrega o papel de lista; o elemento interativo mantém o
 * seu.
 */
export function ListItem(props: StaticProps | LinkProps | ButtonProps) {
  const { leading, title, copy, trailing, className } = props;
  const content = (
    <>
      {leading}
      <div className="list-item-main">
        <p className="list-item-title">{title}</p>
        {copy && <p className="list-item-copy">{copy}</p>}
      </div>
      {trailing}
    </>
  );

  if (typeof (props as LinkProps).href === "string") {
    return (
      <div className="list-row" role="listitem">
        <Link
          className={clsx("list-item", className)}
          href={(props as LinkProps).href}
        >
          {content}
        </Link>
      </div>
    );
  }

  if (typeof (props as ButtonProps).onClick === "function") {
    const { onClick, disabled } = props as ButtonProps;
    return (
      <div className="list-row" role="listitem">
        <button
          type="button"
          className={clsx("list-item", "list-item-button", className)}
          onClick={onClick}
          disabled={disabled}
        >
          {content}
        </button>
      </div>
    );
  }

  return (
    <div className={clsx("list-item", className)} role="listitem">
      {content}
    </div>
  );
}
