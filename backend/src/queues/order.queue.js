const { Queue } = require("bullmq");
const redis = require("../config/redis");

const orderQueue = new Queue("order-processing", {
  connection: redis,
});

module.exports = orderQueue;
