CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyPolicyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalAcceptance_acceptedAt_idx" ON "LegalAcceptance"("acceptedAt");

CREATE UNIQUE INDEX "LegalAcceptance_userId_termsVersion_privacyPolicyVersion_key"
ON "LegalAcceptance"("userId", "termsVersion", "privacyPolicyVersion");

ALTER TABLE "LegalAcceptance"
ADD CONSTRAINT "LegalAcceptance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
