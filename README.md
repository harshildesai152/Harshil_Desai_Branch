# Order Processing System

## 1. Project Overview
A high-throughput bulk order ingestion system capable of streaming and parsing large CSV order files (up to 20MB / 10k+ rows) using Node.js streams, buffering them in a BullMQ background worker, and saving them to a partitioned PostgreSQL database (4 hash-based partitions).

## 2. Tech Stack
* **Runtime:** Node.js (v24+)
* **Framework:** Express.js
* **Database:** PostgreSQL with Prisma ORM (v7+)
* **Queues & Cache:** Redis (v5+) with BullMQ
* **Cloud Storage:** Google Cloud Storage (GCS)

## 3. Features
* **Streaming CSV Parser:** Uses backpressure (`pause()`/`resume()`) to process data in batches of 500 without holding the entire file in memory.
* **Database Sharding:** Employs PostgreSQL declarative hash partitioning into 4 partitions (`orders_p0` to `orders_p3`) mapped on the `customer_id` key.
* **Queue Ingestion:** Uses BullMQ for asynchronous queue handling with progress tracking and automatic job retries.
* **Structured Logging:** Unified console logs mapping starting, batch inserts, completions, validation skips, and errors.

## 4. Project Structure
```text
C:\New folder (2)
├── backend
│   ├── prisma
│   │   ├── migrations/     # SQL migration history
│   │   └── schema.prisma   # Database schema
│   ├── src
│   │   ├── config/         # Database, Redis, and GCS initializers
│   │   ├── controllers/    # Express controllers (orders, jobs, uploads)
│   │   ├── middlewares/    # Multer upload limits & type validations
│   │   ├── repositories/   # Prisma query layers (transactions)
│   │   ├── routes/         # Router mounting definitions
│   │   ├── services/       # CSV validation & routing
│   │   ├── utils/          # Array chunkers
│   │   ├── workers/        # BullMQ stream-safe workers
│   │   └── app.js & server.js
│   └── .env & package.json
└── frontend                # Frontend UI
```

## 5. Prerequisites
* **Node.js** (v24+)
* **PostgreSQL** (v16+)
* **Redis** (v5+)
* **Google Cloud Account** (for GCS buckets)

## 6. Installation
Navigate to the `backend` folder and run:
```bash
npm install
```

## 7. Environment Variables
Create a `.env` file in the `backend/` folder based on `.env.example`:
```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/orders_db"
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
GCP_PROJECT_ID=your-gcp-project-id
GCP_KEY_FILE=path/to/keyfile.json
GCP_BUCKET_NAME=your-gcs-bucket-name
```

## 8. Database Migration
To apply the partitioned tables and reset the database:
```bash
npx prisma migrate dev
```

## 9. Google Cloud ADC Configuration
The system uses the Google Cloud SDK for uploading CSV files. Configure Application Default Credentials (ADC) by pointing to your service account key file in your environment variables:
```bash
# In your .env
GCP_KEY_FILE="absolute/path/to/your/keyfile.json"
```
Alternatively, in development you can authenticate via the gcloud CLI:
```bash
gcloud auth application-default login
```

## 10. Running the Project
Start the development server (runs nodemon):
```bash
npm run dev
```

## 11. API Endpoints
* `POST /orders` - Create a single order (JSON payload)
* `POST /api/orders/upload` - Upload bulk CSV file (Multer field: `"file"`)
* `GET /api/orders/:jobId` - Check BullMQ job progress, failures, and results

## 12. Sharding Strategy
To meet the high scalability requirement, the database uses **PostgreSQL declarative table partitioning**:
* The main `orders` table is partitioned using `PARTITION BY HASH (customer_id)`.
* Database queries map to 4 physical child tables: `orders_p0` to `orders_p3`.
* By utilizing database-level partitioning, we maintain a **single Prisma model** and single query layer, while PostgreSQL automatically hashes and routes rows to the correct physical shard.

## 13. CSV Processing Flow
1. **Client Upload:** File is received, validated as a `.csv` by Multer, and uploaded to GCS.
2. **Queueing:** A job containing the file buffer is queued in Redis (BullMQ).
3. **Streaming Worker:** The background worker streams the file buffer using `csv-parser`.
4. **Validation:** Checks row keys (`customer_id`, `order_amount`, etc.) and filters schema drifts.
5. **Backpressure Batching:** Accumuates valid rows up to 500. Pauses stream parsing, batch inserts using a transactional query, updates percentage progress, and resumes the stream.

## 14. Error Handling
* Stream validation skips malformed rows and logs them to `console.error([INVALID ROW])`.
* Bulk inserts run inside a Prisma Transaction `$transaction`. If a batch fails, it logs `[DATABASE ERROR]`, rolls back the batch, and halts the stream.
* Jobs are configured with **3 attempts** using **exponential backoff (5000ms delay)**. Fails are logged to `[WORKER ERROR]`.

## 15. Design Decisions & Trade-offs
* **In-Memory Streaming over Temp Files:** Using Node.js buffers in memory skips writing temporary files to disk, accelerating ingestion speed but slightly increasing memory usage for large buffers.
* **DB-Level Partitioning over App-Level Sharding:** PostgreSQL-native hash partitioning avoids multiple Prisma client instances or messy raw SQL shard routers in Node.js, yielding cleaner code at the expense of locking sharding logic to PostgreSQL dialect features.

## 16. Future Improvements
* **Dead Letter Queue (DLQ):** Route invalid CSV rows directly to a dedicated table or error log file for download.
* **GCS Streaming download:** Stream the file directly from GCS inside the worker rather than storing the file buffer in the Redis job queue payload to minimize memory impact on Redis.
