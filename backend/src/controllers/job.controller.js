const { Job } = require("bullmq");
const orderQueue = require("../queues/order.queue");

class JobController {
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;

      const job = await Job.fromId(orderQueue, jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          message: "Job not found",
        });
      }

      const state = await job.getState();

      return res.json({
        success: true,
        jobId: job.id,
        status: state,
        progress: job.progress,
        result: job.returnvalue,
        failedReason: job.failedReason,
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

module.exports = new JobController();
