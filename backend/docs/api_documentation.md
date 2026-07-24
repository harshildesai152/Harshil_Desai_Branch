# OrderShard Backend API Documentation

This document describes the API endpoints, request/response formats, and inner architectural logic for the OrderShard backend ingestion pipeline.

---

## Tech Stack & Architecture Overview
* **Runtime**: Node.js (Express)
* **Database**: PostgreSQL (Prisma ORM) with **Declarative Hashing Partitioning** (4 shards based on `customer_id`)
* **Background Queue**: BullMQ + Redis for async file parsing and insertion
* **Object Storage**: Google Cloud Storage (GCS) with local fallback mock

---

## API Endpoints

### 1. Ingest Orders File (CSV)
Uploads a CSV file of orders, saves it to GCS, and queues it for background worker processing.

* **URL**: `/upload-orders` (Alias: `/api/orders/upload`)
* **Method**: `POST`
* **Content-Type**: `multipart/form-data`
* **Request Body**:
  * `file` (File, Required): The CSV file containing order records (e.g. up to 10k rows).
* **cURL Command**:
  ```bash
  curl -X POST -F "file=@/path/to/your/orders.csv" http://localhost:5000/upload-orders
  ```
* **Response**:
  * **Status**: `202 Accepted`
  * **Body**:
    ```json
    {
      "success": true,
      "message": "File uploaded successfully",
      "jobId": "12"
    }
    ```
* **Error Responses**:
  * **400 Bad Request** (Multer upload issue or missing file):
    ```json
    {
      "success": false,
      "message": "CSV file is required"
    }
    ```
  * **500 Internal Server Error**:
    ```json
    {
      "success": false,
      "message": "Internal Server Error"
    }
    ```

---

### 2. Get Ingestion Job Status
Queries the progress of an asynchronous CSV ingestion job using its unique BullMQ Job ID.

* **URL**: `/api/jobs/:jobId`
* **Method**: `GET`
* **Path Parameters**:
  * `jobId` (String, Required): The ID returned by the upload endpoint.
* **cURL Command**:
  ```bash
  curl -X GET http://localhost:5000/api/jobs/12
  ```
* **Response**:
  * **Status**: `200 OK`
  * **Body (In-Progress)**:
    ```json
    {
      "success": true,
      "jobId": "12",
      "status": "active",
      "progress": {
        "progress": 45,
        "validCount": 4500,
        "invalidCount": 5,
        "totalRecords": 10000,
        "batches": 9
      },
      "result": null,
      "failedReason": null
    }
    ```
  * **Body (Completed)**:
    ```json
    {
      "success": true,
      "jobId": "12",
      "status": "completed",
      "progress": {
        "progress": 100,
        "validCount": 9985,
        "invalidCount": 15,
        "totalRecords": 10000,
        "batches": 20
      },
      "result": {
        "valid": 9985,
        "invalid": 15
      },
      "failedReason": null
    }
    ```
* **Error Responses**:
  * **404 Not Found** (Job not active or expired):
    ```json
    {
      "success": false,
      "message": "Job not found"
    }
    ```

---

### 3. Fetch Recent Orders
Retrieves the latest ingested orders from the PostgreSQL partitioned table.

* **URL**: `/orders`
* **Method**: `GET`
* **Query Parameters**:
  * `limit` (Number, Optional, Default: `30`, Max: `100`): Number of orders to return.
  * `customerId` (String, Optional): Filter orders specifically belonging to a customer.
* **cURL Command**:
  ```bash
  # Get latest 30 orders
  curl -X GET http://localhost:5000/orders

  # Get orders filtered by customer ID
  curl -X GET "http://localhost:5000/orders?customerId=cus_10428&limit=10"
  ```
* **Response**:
  * **Status**: `200 OK`
  * **Body**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "7f3a8b2c-9100-4b82-990a-28d82bd921f0",
          "customer": "cus_10428",
          "date": "2026-07-24 10:22",
          "amount": "142.90",
          "status": "completed",
          "shard": "shard-0"
        },
        {
          "id": "1c4e927a-7a1a-45c5-bf6b-0f192b137f3a",
          "customer": "cus_20033",
          "date": "2026-07-24 10:11",
          "amount": "1204.50",
          "status": "pending",
          "shard": "shard-1"
        }
      ]
    }
    ```

---

### 4. Fetch Shard Fleet Stats
Queries row count metrics directly from the PostgreSQL partition tables (`orders_p0` to `orders_p3`) to display load statistics on the console.

* **URL**: `/orders/shards`
* **Method**: `GET`
* **cURL Command**:
  ```bash
  curl -X GET http://localhost:5000/orders/shards
  ```
* **Response**:
  * **Status**: `200 OK`
  * **Body**:
    ```json
    {
      "success": true,
      "data": [
        {
          "name": "shard-0",
          "host": "localhost:5432 (orders_p0)",
          "rows": "2,406",
          "load": 10,
          "status": "healthy"
        },
        {
          "name": "shard-1",
          "host": "localhost:5432 (orders_p1)",
          "rows": "2,611",
          "load": 10,
          "status": "healthy"
        },
        {
          "name": "shard-2",
          "host": "localhost:5432 (orders_p2)",
          "rows": "2,572",
          "load": 10,
          "status": "healthy"
        },
        {
          "name": "shard-3",
          "host": "localhost:5432 (orders_p3)",
          "rows": "2,396",
          "load": 10,
          "status": "healthy"
        }
      ]
    }
    ```

---

### 5. Fetch Single Order by ID
Queries the partitioned database for a single order details.

* **URL**: `/orders/:orderId`
* **Method**: `GET`
* **Path Parameters**:
  * `orderId` (UUID String, Required): The exact UUID of the order record.
* **cURL Command**:
  ```bash
  curl -X GET http://localhost:5000/orders/7f3a8b2c-9100-4b82-990a-28d82bd921f0
  ```
* **Response**:
  * **Status**: `200 OK`
  * **Body**:
    ```json
    {
      "success": true,
      "data": {
        "id": "7f3a8b2c-9100-4b82-990a-28d82bd921f0",
        "customer": "cus_10428",
        "date": "2026-07-24 10:22",
        "amount": "142.90",
        "status": "completed",
        "shard": "shard-0"
      }
    }
    ```
* **Error Responses**:
  * **404 Not Found** (UUID is invalid format or record does not exist):
    ```json
    {
      "success": false,
      "message": "Order not found"
    }
    ```

---

## Architectural Logic

### Shard Resolution Formula
When orders are processed or fetched, the shard is determined using the MD5 hashing of the `customer_id` modulo 4. The 4 shards represent distinct partitions in the database:
1. Compute MD5 checksum of `customer_id`.
2. Extract the first 8 characters and parse them as a hex integer.
3. Apply modulo 4 to get the partition index (`0`, `1`, `2`, or `3`).

### CSV Row Validation Criteria
The streaming parser validates each row against the schema constraints in [csvValidation.service.js](file:///c:/New%20folder%20(2)/backend/src/services/csvValidation.service.js):
* `customer_id`: Must be present.
* `order_date`: Must be a valid date.
* `order_amount`: Must be a valid positive numeric value.
* `status`: Must be present and belong to the `OrderStatus` enum values (`PENDING`, `PROCESSING`, `COMPLETED`, `CANCELLED`).
