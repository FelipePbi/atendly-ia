-- Cor personalizada do serviço (seletor de cores, 2026-10-18).
--
-- ADITIVA: uma coluna nova, nula. As seis cores sugeridas continuam em
-- `colorToken`; a cor escolhida no seletor fica aqui como `#rrggbb`. O serviço
-- tem uma cor só, então no máximo uma das duas é preenchida.
ALTER TABLE "Service" ADD COLUMN "colorHex" TEXT;

ALTER TABLE "Service" ADD CONSTRAINT "Service_color_hex_check"
  CHECK ("colorHex" IS NULL OR ("colorHex" ~ '^#[0-9a-f]{6}$' AND "colorToken" IS NULL));
