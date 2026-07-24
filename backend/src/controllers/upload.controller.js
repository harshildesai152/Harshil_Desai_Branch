const orderQueue = require("../queues/order.queue");
const gcsBucket = require("../config/gcs");

class UploadController {
  async uploadOrders(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "CSV file is required",
        });
      }

      console.log(`[UPLOAD START] ${req.file.originalname}`);

      const fileName = `orders/${Date.now()}-${req.file.originalname}`;

      const file = gcsBucket.file(fileName);

      await file.save(req.file.buffer, {
        resumable: false,
        contentType: req.file.mimetype,
      });

      console.log(`[UPLOAD SUCCESS] ${fileName}`);

      const job = await orderQueue.add(
        "process-orders",
        {
          fileBuffer: req.file.buffer,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );

      return res.status(202).json({
        success: true,
        message: "File uploaded successfully",
        jobId: job.id,
      });
    } catch (error) {
      console.error(`[UPLOAD FAILED]`, error);

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }
}

module.exports = new UploadController();
