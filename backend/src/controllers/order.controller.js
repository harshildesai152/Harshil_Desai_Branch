const orderService = require("../services/order.service");

class OrderController {
  async createOrder(req, res) {
    try {
      const order = await orderService.createOrder(req.body);

      return res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: order,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }

  async getShardStats(req, res) {
    try {
      const stats = await orderService.getShardStats();

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }

  async getOrders(req, res) {
    try {
      const { limit = 30, customerId } = req.query;
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

      const filter = {};
      if (customerId) {
        filter.customerId = customerId;
      }

      const orders = await orderService.getOrders(filter, parsedLimit);

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }

  async getOrderById(req, res) {
    try {
      const { orderId } = req.params;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderId)) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const order = await orderService.getOrderById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }
}

module.exports = new OrderController();
