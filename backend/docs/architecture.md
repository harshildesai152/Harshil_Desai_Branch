                          Client
                             │
                             ▼
                  POST /upload-orders
                             │
                             ▼
                  Express Controller
                             │
                Validate uploaded file
                             │
                             ▼
             Upload file to Google Cloud Storage
                  (Application Default Credentials)
                             │
                             ▼
             Create BullMQ Job (Stored in Redis)
                             │
                 Return 202 Accepted + Job ID
                             │
────────────────────────────────────────────────────────────

                      Redis (BullMQ Queue)

────────────────────────────────────────────────────────────
                             │
                             ▼
                    Background Worker
                             │
                  Download file from GCS
                             │
                             ▼
                  Stream CSV Parser
                     (No full file in memory)
                             │
                             ▼
                  Validate each record
                             │
          Invalid rows → invalid_orders table / log
                             │
                             ▼
                Shard Router Service
             hash(customer_id) % 4
                             │
                 Batch records per shard
                             │
                             ▼
          PostgreSQL (Application-level Sharding)
                             │
                             ▼
              Batch Insert + Transaction
                             │
                             ▼
                 Update Job Status (Redis)