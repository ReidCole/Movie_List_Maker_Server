const mongoose = require("mongoose");

const refreshTokenSchema = mongoose.Schema({
  token: String,
  username: String,
});

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
