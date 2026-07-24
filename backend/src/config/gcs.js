const { Storage } = require("@google-cloud/storage");

let bucket;

if (
  !process.env.GCP_PROJECT_ID ||
  !process.env.GCP_KEY_FILE ||
  !process.env.GCP_BUCKET_NAME ||
  process.env.GCP_BUCKET_NAME === "dummy-bucket-name"
) {
  console.warn(
    "⚠️ Warning: GCP credentials or bucket name are dummy/missing. Running in LOCAL_MOCK mode for Google Cloud Storage."
  );
  bucket = {
    file: (name) => ({
      save: async (buffer, options) => {
        console.log(`[GCS MOCK] File saved: ${name} (${buffer.length} bytes)`);
      },
    }),
  };
} else {
  const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    keyFilename: process.env.GCP_KEY_FILE,
  });
  bucket = storage.bucket(process.env.GCP_BUCKET_NAME);
}

module.exports = bucket;
