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
}

module.exports = new OrderRepository();
