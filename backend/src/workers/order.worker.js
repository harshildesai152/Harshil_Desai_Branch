const { Worker } = require("bullmq");
const redis = require("../config/redis");
const csv = require("csv-parser");
const { Readable } = require("stream");
const { validateOrder } = require("../services/csvValidation.service");
const orderRepository = require("../repositories/order.repository");

const worker = new Worker(
  "order-processing",
  async (job) => {
    try {
      console.log(`[PROCESSING START] Job ${job.id}`);
      await job.updateProgress(0);

      let buffer = job.data.fileBuffer;
      if (!buffer) {
        throw new Error("No file buffer found in job data");
      }

      if (buffer.type === "Buffer" && Array.isArray(buffer.data)) {
        buffer = Buffer.from(buffer.data);
      }

      // Count newlines in the buffer to determine total rows
      let totalLines = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 10) { // '\n'
          totalLines++;
        }
      }
      if (buffer.length > 0 && buffer[buffer.length - 1] !== 10) {
        totalLines++;
      }
      const totalRecords = Math.max(0, totalLines - 1); // Exclude CSV header line
      console.log(`Estimated records to process: ${totalRecords}`);

      const BATCH_SIZE = 500;
      let batch = [];
      let validCount = 0;
      let invalidCount = 0;

      return await new Promise((resolve, reject) => {
        const stream = Readable.from(buffer).pipe(csv());

        stream.on("data", async (row) => {
          const validation = validateOrder(row);

          if (!validation.isValid) {
            invalidCount++;
            console.error(`[INVALID ROW]`, validation.errors);
            return;
          }

          batch.push({
            orderId: row.order_id,
            customerId: row.customer_id,
            orderDate: new Date(row.order_date),
            orderAmount: Number(row.order_amount),
            status: row.status,
          });

          validCount++;

          if (batch.length >= BATCH_SIZE) {
            stream.pause();
            try {
              await orderRepository.createManyOrders(batch);
              console.log(`[BATCH INSERTED] ${batch.length} records`);

              const progressPercent = totalRecords > 0 ? Math.round((validCount / totalRecords) * 100) : 50;
              await job.updateProgress({
                progress: Math.min(99, progressPercent),
                validCount,
                invalidCount,
                totalRecords,
                batches: Math.floor(validCount / BATCH_SIZE),
              });
              console.log(`Progress: ${progressPercent}% (${validCount} valid records)`);

              batch = [];
            } catch (err) {
              console.error(`[DATABASE ERROR]`, err);
              reject(err);
              stream.destroy(err);
              return;
            } finally {
              stream.resume();
            }
          }
        });

        stream.on("end", async () => {
          try {
            if (batch.length > 0) {
              await orderRepository.createManyOrders(batch);
              console.log(`[BATCH INSERTED] ${batch.length} records`);
              batch = [];
            }

            console.log(
              `[PROCESSING COMPLETE] Valid: ${validCount}, Invalid: ${invalidCount}`
            );

            await job.updateProgress({
              progress: 100,
              validCount,
              invalidCount,
              totalRecords,
              batches: Math.floor(validCount / BATCH_SIZE),
            });

            resolve({
              valid: validCount,
              invalid: invalidCount,
            });
          } catch (err) {
            console.error(`[DATABASE ERROR]`, err);
            reject(err);
          }
        });

        stream.on("error", (err) => {
          reject(err);
        });
      });
    } catch (error) {
      console.error(`[WORKER ERROR]`, error);
      throw error; // BullMQ marks the job as failed
    }
  },
  {
    connection: redis,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.log(`❌ Job ${job.id} failed`);
  console.error(err);
});

module.exports = worker;
