const express = require('express');

const app = express();

// Parse JSON payloads
app.use(express.json());

// Base Route
app.get('/', (req, res) => {
  res.json({ message: "Backend Running" });
});

module.exports = app;
