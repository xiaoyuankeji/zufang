const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.ObjectId,
    ref: 'Landlord',
    required: [true, 'Listing must belong to a landlord']
  },
  title: {
    type: String,
    required: [true, 'A listing must have a title'],
    trim: true,
    maxLength: 100
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'A listing must have a price']
  },
  location: {
    type: String,
    required: [true, 'A listing must have a location (e.g., Lille Sud)']
  },
  address: {
    type: String,
    select: false // Only show to confirmed tenants or owner
  },
  images: [String], // Array of image URLs
  tags: [String], // e.g. ['近地铁', '包网']

  // Review / moderation (required before charging & public display)
  reviewStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewNote: {
    type: String,
    default: ''
  },
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'Landlord'
  },
  
  // Status fields
  isActive: {
    type: Boolean,
    default: true
  },
  isPromoted: { // 是否置顶/推荐
    type: Boolean,
    default: false
  },
  promotedUntil: {
    type: Date
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Listing', listingSchema);


