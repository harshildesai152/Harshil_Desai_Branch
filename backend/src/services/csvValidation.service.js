function validateOrder(order) {
  const errors = [];

  const customerId = order.customerId || order.customer_id;
  const orderDate = order.orderDate || order.order_date;
  const orderAmount = order.orderAmount || order.order_amount;
  const status = order.status;

  if (!customerId) {
    errors.push("customerId is required");
  }

  if (!orderDate) {
    errors.push("orderDate is required");
  }

  if (!orderAmount) {
    errors.push("orderAmount is required");
  }

  if (isNaN(Number(orderAmount))) {
    errors.push("orderAmount must be a number");
  }

  if (!status) {
    errors.push("status is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateOrder,
};
