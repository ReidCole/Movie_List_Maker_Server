const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  creationDate: {
    type: Date,
    immutable: true,
    required: true,
  },
  lastLoginDate: {
    type: Date,
    required: true,
    default: 0,
  },
  lists: {
    type: [mongoose.Types.ObjectId],
    required: false,
    default: [],
  },
});

module.exports = mongoose.model("User", userSchema);
