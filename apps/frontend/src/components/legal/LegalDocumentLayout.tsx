import type { LegalDocumentContent } from "@/content/legal/types";
import { LegalDocumentHeader } from "./LegalDocumentHeader";
import { LegalDocumentMetadata } from "./LegalDocumentMetadata";
import { LegalSection } from "./LegalSection";
import { LegalTableOfContents } from "./LegalTableOfContents";

export function LegalDocumentLayout({
  document,
  contactEmail,
}: {
  document: LegalDocumentContent;
  contactEmail: string;
}) {
  const canLinkContact = contactEmail.includes("@");

  return (
    <div className="legal-page">
      <a className="legal-skip-link" href="#conteudo-legal">
        Ir para o conteúdo
      </a>
      <LegalDocumentHeader />
      <main className="legal-main" id="conteudo-legal">
        <div className="legal-hero">
          <span className="legal-eyebrow">Documento legal</span>
          <h1>{document.title}</h1>
          <p>{document.intro}</p>
          <p className="legal-review-notice" role="note">
            Template técnico inicial. Conteúdo sujeito à revisão jurídica e de proteção de dados antes da publicação.
          </p>
          <LegalDocumentMetadata
            version={document.version}
            effectiveDate={document.effectiveDate}
            lastUpdatedDate={document.lastUpdatedDate}
          />
        </div>

        <div className="legal-grid">
          <LegalTableOfContents sections={document.sections} />
          <article className="legal-article">
            {document.sections.map((section) => <LegalSection section={section} key={section.id} />)}
          </article>
        </div>
      </main>
      <footer className="legal-footer">
        <div className="legal-footer__inner">
          <span>Atendly</span>
          <p>
            Canal de contato:{" "}
            {canLinkContact ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : <strong>{contactEmail}</strong>}
          </p>
        </div>
      </footer>
    </div>
  );
}
