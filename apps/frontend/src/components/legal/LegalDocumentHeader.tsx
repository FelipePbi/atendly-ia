import Image from "next/image";
import Link from "next/link";
import { LegalBackButton } from "./LegalBackButton";

export function LegalDocumentHeader() {
  return (
    <header className="legal-header">
      <div className="legal-header__inner">
        <Link className="legal-brand" href="/" aria-label="Atendly — página inicial">
          <Image src="/brand/atendly-logo-icon.png" alt="" width={32} height={32} priority />
          <span>Atendly</span>
        </Link>
        <LegalBackButton />
      </div>
    </header>
  );
}
