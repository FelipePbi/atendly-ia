CREATE TYPE "UserSex" AS ENUM (
  'MALE',
  'FEMALE',
  'OTHER',
  'PREFER_NOT_TO_SAY'
);

CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "age" INTEGER NOT NULL,
  "sex" "UserSex" NOT NULL,
  "businessName" TEXT NOT NULL,
  "businessNiche" TEXT NOT NULL,
  "whatsappPhoneRaw" TEXT,
  "whatsappPhoneNormalized" TEXT,
  "onboardingCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_onboardingCompletedAt_idx" ON "UserProfile"("onboardingCompletedAt");

ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
