import type { LegalSectionContent } from "@/content/legal/types";

export function LegalTableOfContents({ sections }: { sections: LegalSectionContent[] }) {
  return (
    <nav className="legal-toc" aria-label="Sumário do documento">
      <h2>Sumário</h2>
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, "")}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
