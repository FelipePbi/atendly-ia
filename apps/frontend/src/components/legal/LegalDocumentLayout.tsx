import Link from "next/link";

import type { LegalDocumentContent } from "@/content/legal/types";
import { Brand } from "@/shared/ui/Brand";

function ChevronLeft({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function LegalDocumentLayout({
  document,
  contactEmail,
}: {
  document: LegalDocumentContent;
  contactEmail: string;
}) {
  const canLinkContact = contactEmail.includes("@");
  return (
    <main className="legal-page">
      <header className="legal-appbar">
        <Link
          className="legal-appbar-back"
          href="/cadastro"
          aria-label="Voltar para criar conta"
        >
          <ChevronLeft size={22} />
        </Link>
        <span className="legal-appbar-title">{document.title}</span>
        <span className="legal-appbar-spacer" aria-hidden="true" />
      </header>
      <header className="legal-topbar">
        <Brand href="/login" />
        <Link className="legal-topbar-back" href="/cadastro">
          <ChevronLeft size={18} />
          Voltar para criar conta
        </Link>
      </header>
      <div className="legal-body">
        <nav className="legal-toc" aria-label="Sumário">
          <span className="legal-toc-title">Sumário</span>
          {document.sections.map((section) => (
            <a href={`#${section.id}`} key={section.id}>
              {section.title.replace(/^\d+\.\s*/, "")}
            </a>
          ))}
        </nav>
        <article className="legal-document">
          <header className="legal-head">
            <p className="legal-eyebrow">Documento legal</p>
            <h1>{document.title}</h1>
            <p className="legal-intro">{document.intro}</p>
          </header>
          <div className="legal-note" role="note">
            <ShieldIcon />
            <span>
              <strong>Revisão jurídica:</strong> conteúdo técnico sujeito à
              aprovação formal antes da publicação.
            </span>
          </div>
          <dl className="legal-meta">
            <div>
              <dt>Versão</dt>
              <dd>{document.version}</dd>
            </div>
            <div>
              <dt>Vigência</dt>
              <dd>{document.effectiveDate}</dd>
            </div>
            <div>
              <dt>Última atualização</dt>
              <dd>{document.lastUpdatedDate}</dd>
            </div>
          </dl>
          <div className="legal-sections">
            {document.sections.map((section) => (
              <section
                className="legal-section"
                id={section.id}
                key={section.id}
              >
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.subsections?.map((subsection) => (
                  <div className="legal-subsection" key={subsection.title}>
                    <h3>{subsection.title}</h3>
                    {subsection.paragraphs?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {subsection.bullets && (
                      <ul>
                        {subsection.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            ))}
            <footer className="legal-section">
              <h2>Contato</h2>
              <p>
                {canLinkContact ? (
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                ) : (
                  <strong>{contactEmail}</strong>
                )}
              </p>
            </footer>
          </div>
        </article>
      </div>
    </main>
  );
}
