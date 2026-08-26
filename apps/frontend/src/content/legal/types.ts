export type LegalSubsection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalSectionContent = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
};

export type LegalDocumentContent = {
  title: string;
  intro: string;
  version: string;
  effectiveDate: string;
  lastUpdatedDate: string;
  sections: LegalSectionContent[];
};
