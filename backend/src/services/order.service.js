const orderRepository = require("../repositories/order.repository");
const { getShard } = require("./shard.service");

class OrderService {
  async createOrder(orderData) {
    const shard = getShard(orderData.customerId);

    console.log(`Customer ${orderData.customerId} belongs to Shard ${shard}`);

    return await orderRepository.createOrder(orderData);
  }
}

module.exports = new OrderService();
