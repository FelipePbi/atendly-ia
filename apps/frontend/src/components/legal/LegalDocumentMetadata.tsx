import { formatLegalDate } from "@/config/legal-versions";

export function LegalDocumentMetadata({
  version,
  effectiveDate,
  lastUpdatedDate,
}: {
  version: string;
  effectiveDate: string;
  lastUpdatedDate: string;
}) {
  return (
    <dl className="legal-metadata" aria-label="Informações do documento">
      <div>
        <dt>Versão</dt>
        <dd>{version}</dd>
      </div>
      <div>
        <dt>Vigência</dt>
        <dd>{formatLegalDate(effectiveDate)}</dd>
      </div>
      <div>
        <dt>Última atualização</dt>
        <dd>{formatLegalDate(lastUpdatedDate)}</dd>
      </div>
    </dl>
  );
}
