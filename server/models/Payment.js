const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.ObjectId,
    ref: 'Landlord',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'EUR'
  },
  type: {
    type: String,
    enum: ['deposit', 'promote_listing', 'unlock_lead', 'membership'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  // 关联对象 ID (如果是推广房源，则是 listingId；如果是解锁线索，则是 leadId)
  targetId: {
    type: mongoose.Schema.ObjectId
  },
  transactionId: String, // Stripe or Alipay ID
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Payment', paymentSchema);





