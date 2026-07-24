const express = require("express");
const router = express.Router();

const orderController = require("../controllers/order.controller");

router.post("/", orderController.createOrder);
router.get("/shards", orderController.getShardStats);
router.get("/", orderController.getOrders);
router.get("/:orderId", orderController.getOrderById);

module.exports = router;
