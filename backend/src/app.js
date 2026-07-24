const express = require('express');
const orderRoute = require("./routes/order.route");
const uploadRoute = require("./routes/upload.route");
const jobRoute = require("./routes/job.route");

const app = express();

// CORS Middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Parse JSON payloads
app.use(express.json());

// Base Route
app.get('/', (req, res) => {
  res.json({ message: "Backend Running" });
});

app.use("/orders", orderRoute);
app.use("/api/orders", uploadRoute);
app.use("/upload-orders", uploadRoute);
app.use("/api/jobs", jobRoute);

// Global Error Handler
app.use((err, req, res, next) => {
  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}. Make sure the form-data key name for the file is 'file'.`,
      code: err.code,
    });
  }

  console.error("Unhandled error:", err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
