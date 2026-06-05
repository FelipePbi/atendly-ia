CREATE TABLE "BusinessSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessName" TEXT NOT NULL DEFAULT '',
  "professionalName" TEXT DEFAULT '',
  "businessAddress" TEXT DEFAULT '',
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "maxSlotsToOffer" INTEGER NOT NULL DEFAULT 3,
  "availabilityDays" INTEGER NOT NULL DEFAULT 14,
  "slotStepMinutes" INTEGER NOT NULL DEFAULT 30,
  "appointmentLookupDays" INTEGER NOT NULL DEFAULT 90,
  "delayPolicy" TEXT DEFAULT '',
  "cancellationPolicy" TEXT DEFAULT '',
  "depositPolicy" TEXT DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessSettings_userId_key" ON "BusinessSettings"("userId");

ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BusinessSettings" (
  "id",
  "userId",
  "businessName",
  "professionalName",
  "businessAddress",
  "timezone",
  "maxSlotsToOffer",
  "availabilityDays",
  "slotStepMinutes",
  "appointmentLookupDays",
  "delayPolicy",
  "cancellationPolicy",
  "depositPolicy",
  "createdAt",
  "updatedAt"
)
SELECT
  'bs_' || md5("User"."id" || CURRENT_TIMESTAMP::text),
  "User"."id",
  COALESCE("UserProfile"."businessName", ''),
  '',
  '',
  'America/Sao_Paulo',
  3,
  14,
  30,
  90,
  'A tolerância é de 15 minutos. Depois disso pode ser necessário remarcar.',
  'Cancelamentos devem ser avisados com pelo menos 24 horas de antecedência.',
  'Para reservar o horário pode ser solicitado sinal via Pix, conforme orientação da profissional.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
LEFT JOIN "UserProfile" ON "UserProfile"."userId" = "User"."id"
ON CONFLICT ("userId") DO NOTHING;
