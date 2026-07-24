const express = require("express");
const router = express.Router();

const jobController = require("../controllers/job.controller");

router.get("/:jobId", jobController.getJobStatus);

module.exports = router;
