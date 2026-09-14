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
      <Link
        className={clsx("list-item", className)}
        href={(props as LinkProps).href}
      >
        {content}
      </Link>
    );
  }

  if (typeof (props as ButtonProps).onClick === "function") {
    const { onClick, disabled } = props as ButtonProps;
    return (
      <button
        type="button"
        className={clsx("list-item", "list-item-button", className)}
        onClick={onClick}
        disabled={disabled}
      >
        {content}
      </button>
    );
  }

  return <div className={clsx("list-item", className)}>{content}</div>;
}
