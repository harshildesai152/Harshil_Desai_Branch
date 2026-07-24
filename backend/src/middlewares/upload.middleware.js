const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    if (ext !== ".csv") {
      return cb(new Error("Only CSV files are allowed."));
    }

    cb(null, true);
  },
});

module.exports = upload;
