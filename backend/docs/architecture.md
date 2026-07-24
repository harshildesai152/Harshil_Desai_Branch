                          Client
                             │
                             ▼
                  POST /api/orders/upload
                             │
                             ▼
                  Express Controller
                             │
                Validate uploaded file
                             │
                             ▼
             Upload file to Google Cloud Storage
              (LOCAL_MOCK mode if dummy keys)
                             │
                             ▼
             Create BullMQ Job (Pass fileBuffer)
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
                             ▼
                  Stream CSV Parser (from buffer)
                     (No full file in memory)
                             │
                             ▼
                  Validate each record
                             │
            Invalid rows → increment invalidCount
                             │
                             ▼
                 PostgreSQL (Database-level Partitioning)
                    hash(customer_id) % 4
                             │
                             ▼
                 Batch Insert + Transaction
                             │
                             ▼
                  Update Job Status (Redis)