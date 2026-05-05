-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN     "minimumRuntimeDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "noveltyFlagged" BOOLEAN NOT NULL DEFAULT false;
