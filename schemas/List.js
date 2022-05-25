const mongoose = require("mongoose");
const { schema: listingSchema } = require("./Listing");

const listSchema = new mongoose.Schema({
  listName: {
    type: String,
    required: true,
  },
  listDescription: {
    type: String,
    required: false,
    default: "",
  },
  listings: {
    type: [listingSchema],
    required: true,
    default: [],
  },
  ownerUsername: {
    type: String,
    required: true,
  },
  lastUpdatedDate: {
    type: Date,
    required: true,
    default: 0,
  },
  creationDate: {
    type: Date,
    required: true,
    default: () => Date.now(),
  },
});

module.exports = mongoose.model("List", listSchema);
