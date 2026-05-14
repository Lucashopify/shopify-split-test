-- Remove price testing fields from Experiment
ALTER TABLE "Experiment" DROP COLUMN IF EXISTS "targetProductHandle";
ALTER TABLE "Experiment" DROP COLUMN IF EXISTS "shopifyDiscountId";

-- Remove price testing fields from Variant
ALTER TABLE "Variant" DROP COLUMN IF EXISTS "priceAdjType";
ALTER TABLE "Variant" DROP COLUMN IF EXISTS "priceAdjValue";

-- Remove PRICE from ExperimentType enum
-- Retype any existing PRICE experiments to SECTION before removing the enum value
UPDATE "Experiment" SET "type" = 'SECTION'::"ExperimentType" WHERE "type" = 'PRICE'::"ExperimentType";
ALTER TYPE "ExperimentType" RENAME TO "ExperimentType_old";
CREATE TYPE "ExperimentType" AS ENUM ('PAGE', 'TEMPLATE', 'THEME', 'URL_REDIRECT', 'SECTION');
ALTER TABLE "Experiment" ALTER COLUMN "type" TYPE "ExperimentType" USING "type"::text::"ExperimentType";
DROP TYPE "ExperimentType_old";
