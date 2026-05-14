-- Add isShopifyPlus to Shop
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "isShopifyPlus" BOOLEAN NOT NULL DEFAULT false;

-- Add price testing fields back to Experiment
ALTER TABLE "Experiment" ADD COLUMN IF NOT EXISTS "targetProductHandle" TEXT;
ALTER TABLE "Experiment" ADD COLUMN IF NOT EXISTS "shopifyDiscountId" TEXT;

-- Add price testing fields back to Variant
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "priceAdjType" TEXT;
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "priceAdjValue" DOUBLE PRECISION;

-- Add PRICE back to ExperimentType enum
ALTER TYPE "ExperimentType" RENAME TO "ExperimentType_old";
CREATE TYPE "ExperimentType" AS ENUM ('PAGE', 'TEMPLATE', 'THEME', 'PRICE', 'URL_REDIRECT', 'SECTION');
ALTER TABLE "Experiment" ALTER COLUMN "type" TYPE "ExperimentType" USING "type"::text::"ExperimentType";
DROP TYPE "ExperimentType_old";
