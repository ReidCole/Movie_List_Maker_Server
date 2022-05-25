const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  mediaType: {
    type: String,
    required: true,
  },
  movieDbId: {
    type: Number,
    required: false,
    default: 0,
  },
  imgUrl: {
    type: String,
    required: false,
  },
  idWithinList: {
    type: String,
    required: true,
  },
});

module.exports = { Listing: mongoose.model("Listing", listingSchema), schema: listingSchema };
