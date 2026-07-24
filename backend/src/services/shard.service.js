const crypto = require("crypto");

function getShard(customerId) {
  const hash = crypto
    .createHash("md5")
    .update(customerId)
    .digest("hex");

  return parseInt(hash.substring(0, 8), 16) % 4;
}

module.exports = {
  getShard,
};
