import Link from "next/link";

import type { LegalDocumentContent } from "@/content/legal/types";
import { Brand } from "@/shared/ui/Brand";

export function LegalDocumentLayout({
  document,
  contactEmail,
}: {
  document: LegalDocumentContent;
  contactEmail: string;
}) {
  const canLinkContact = contactEmail.includes("@");
  return (
    <main className="auth-layout legal-layout">
      <aside className="auth-brand-panel legal-brand-panel">
        <Brand href="/login" />
        <div className="auth-story">
          <p className="eyebrow">Informação clara</p>
          <h2>
            {document.title === "Termos de Uso"
              ? "Condições de uso em linguagem direta."
              : "Transparência sem jargão."}
          </h2>
          <p>
            Documento organizado para leitura clara em qualquer tamanho de tela.
          </p>
        </div>
        <div className="auth-flow" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </aside>
      <section className="auth-main legal-main">
        <article className="legal-document">
          <Link className="auth-back" href="/cadastro">
            ← Voltar ao cadastro
          </Link>
          <header>
            <h1>{document.title}</h1>
            <p>
              Versão {document.version} · vigência em {document.effectiveDate}
            </p>
          </header>
          <div className="legal-note" role="note">
            <strong>Revisão jurídica:</strong> conteúdo técnico sujeito à
            aprovação formal antes da publicação.
          </div>
          <p>{document.intro}</p>
          {document.sections.map((section) => (
            <section className="legal-section" id={section.id} key={section.id}>
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
                <div key={subsection.title}>
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
            <p>Última atualização: {document.lastUpdatedDate}</p>
          </footer>
        </article>
      </section>
    </main>
  );
}
