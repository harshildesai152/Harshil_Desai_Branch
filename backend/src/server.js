require('dotenv').config();
const app = require('./app');

// Start BullMQ Worker
require("./workers/order.worker");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
