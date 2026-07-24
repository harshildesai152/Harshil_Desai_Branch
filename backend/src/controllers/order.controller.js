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
}

module.exports = new OrderController();
