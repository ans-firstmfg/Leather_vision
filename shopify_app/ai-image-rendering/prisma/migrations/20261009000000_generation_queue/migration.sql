CREATE TABLE "Generation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "customerId" TEXT,
  "actorHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploading',
  "options" TEXT NOT NULL,
  "variations" TEXT NOT NULL DEFAULT '[]',
  "variationCount" INTEGER NOT NULL,
  "selectedVariation" TEXT,
  "error" TEXT,
  "workerId" TEXT,
  "leaseUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "Generation_shop_createdAt_idx" ON "Generation"("shop", "createdAt");
CREATE INDEX "Generation_actorHash_createdAt_idx" ON "Generation"("actorHash", "createdAt");
CREATE INDEX "Generation_status_createdAt_idx" ON "Generation"("status", "createdAt");
CREATE INDEX "Generation_expiresAt_idx" ON "Generation"("expiresAt");
