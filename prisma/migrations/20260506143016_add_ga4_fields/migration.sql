-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "ga4AccessToken" TEXT,
ADD COLUMN     "ga4AccessTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "ga4PropertyId" TEXT,
ADD COLUMN     "ga4PropertyName" TEXT,
ADD COLUMN     "ga4RefreshToken" TEXT;
