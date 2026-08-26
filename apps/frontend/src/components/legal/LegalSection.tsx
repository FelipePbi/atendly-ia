import type { LegalSectionContent } from "@/content/legal/types";

export function LegalSection({ section }: { section: LegalSectionContent }) {
  return (
    <section className="legal-section" id={section.id} tabIndex={-1}>
      <h2>{section.title}</h2>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.bullets ? (
        <ul>
          {section.bullets.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {section.subsections?.map((subsection) => (
        <div className="legal-subsection" key={subsection.title}>
          <h3>{subsection.title}</h3>
          {subsection.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {subsection.bullets ? (
            <ul>
              {subsection.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}
