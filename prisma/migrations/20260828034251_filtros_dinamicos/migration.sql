-- CreateTable
CREATE TABLE "filter_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filter_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filter_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filter_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_filter_options" (
    "productId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "product_filter_options_pkey" PRIMARY KEY ("productId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "filter_groups_slug_key" ON "filter_groups"("slug");

-- CreateIndex
CREATE INDEX "filter_groups_isActive_position_idx" ON "filter_groups"("isActive", "position");

-- CreateIndex
CREATE INDEX "filter_options_groupId_position_idx" ON "filter_options"("groupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "filter_options_groupId_slug_key" ON "filter_options"("groupId", "slug");

-- CreateIndex
CREATE INDEX "product_filter_options_optionId_idx" ON "product_filter_options"("optionId");

-- AddForeignKey
ALTER TABLE "filter_options" ADD CONSTRAINT "filter_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "filter_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_filter_options" ADD CONSTRAINT "product_filter_options_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_filter_options" ADD CONSTRAINT "product_filter_options_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "filter_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
