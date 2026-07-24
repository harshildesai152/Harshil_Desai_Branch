const prisma = require("../config/prisma");

class OrderRepository {
  async createOrder(orderData) {
    return await prisma.order.create({
      data: orderData,
    });
  }

  async createManyOrders(orders) {
    return await prisma.$transaction(async (tx) => {
      return await tx.order.createMany({
        data: orders,
        skipDuplicates: true,
      });
    });
  }

  async getShardStats() {
    const counts = await prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*)::int FROM orders_p0) as p0,
        (SELECT COUNT(*)::int FROM orders_p1) as p1,
        (SELECT COUNT(*)::int FROM orders_p2) as p2,
        (SELECT COUNT(*)::int FROM orders_p3) as p3
    `;
    const result = counts[0] || { p0: 0, p1: 0, p2: 0, p3: 0 };
    return [
      { name: "shard-0", host: "localhost:5432 (orders_p0)", rows: result.p0.toLocaleString(), load: Math.min(95, Math.max(10, Math.round(result.p0 / 500))), status: "healthy" },
      { name: "shard-1", host: "localhost:5432 (orders_p1)", rows: result.p1.toLocaleString(), load: Math.min(95, Math.max(10, Math.round(result.p1 / 500))), status: "healthy" },
      { name: "shard-2", host: "localhost:5432 (orders_p2)", rows: result.p2.toLocaleString(), load: Math.min(95, Math.max(10, Math.round(result.p2 / 500))), status: "healthy" },
      { name: "shard-3", host: "localhost:5432 (orders_p3)", rows: result.p3.toLocaleString(), load: Math.min(95, Math.max(10, Math.round(result.p3 / 500))), status: "healthy" },
    ];
  }

  async getOrders(filter, limit) {
    return await prisma.order.findMany({
      where: filter,
      orderBy: {
        orderDate: "desc",
      },
      take: limit,
    });
  }

  async getOrderById(orderId) {
    return await prisma.order.findFirst({
      where: {
        orderId: orderId,
      },
    });
  }
}

module.exports = new OrderRepository();
