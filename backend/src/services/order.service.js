const orderRepository = require("../repositories/order.repository");
const { getShard } = require("./shard.service");

class OrderService {
  async createOrder(orderData) {
    const shard = getShard(orderData.customerId);

    console.log(`Customer ${orderData.customerId} belongs to Shard ${shard}`);

    return await orderRepository.createOrder(orderData);
  }

  async getShardStats() {
    return await orderRepository.getShardStats();
  }

  async getOrders(filter, limit) {
    const orders = await orderRepository.getOrders(filter, limit);
    return orders.map((o) => ({
      id: o.orderId,
      customer: o.customerId,
      date: new Date(o.orderDate).toISOString().replace("T", " ").substring(0, 16), // formats nicely like "2026-07-24 10:22"
      amount: o.orderAmount ? o.orderAmount.toString() : "0.00",
      status: o.status ? o.status.toLowerCase() : "pending",
      shard: `shard-${getShard(o.customerId)}`,
    }));
  }

  async getOrderById(orderId) {
    const o = await orderRepository.getOrderById(orderId);
    if (!o) return null;
    return {
      id: o.orderId,
      customer: o.customerId,
      date: new Date(o.orderDate).toISOString().replace("T", " ").substring(0, 16),
      amount: o.orderAmount ? o.orderAmount.toString() : "0.00",
      status: o.status ? o.status.toLowerCase() : "pending",
      shard: `shard-${getShard(o.customerId)}`,
    };
  }
}

module.exports = new OrderService();
