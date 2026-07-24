-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "orders" (
    "order_id" UUID NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "order_amount" DECIMAL(12,2) NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id","customer_id")
) PARTITION BY HASH (customer_id);

-- Create Partitions
CREATE TABLE "orders_p0" PARTITION OF "orders" FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE "orders_p1" PARTITION OF "orders" FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE "orders_p2" PARTITION OF "orders" FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE "orders_p3" PARTITION OF "orders" FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_order_date_idx" ON "orders"("order_date");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");
