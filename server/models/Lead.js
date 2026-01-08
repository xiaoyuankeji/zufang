const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  // 关联的房源（可选，可能是普通咨询）
  listing: {
    type: mongoose.Schema.ObjectId,
    ref: 'Listing'
  },
  // 意向区域/需求描述
  requirement: {
    type: String,
    required: true
  },
  budget: {
    type: String
  },
  moveInDate: {
    type: Date
  },
  
  // 租客联系方式 (这是需要付费解锁的核心资产)
  wechatId: {
    type: String,
    required: true
  },
  phone: String,
  email: String,
  
  // 解锁记录：哪些房东已经解锁了这个线索
  unlockedBy: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Landlord'
  }],
  
  status: {
    type: String,
    enum: ['new', 'contacted', 'closed'],
    default: 'new'
  },

  // Review / moderation (required before landlords can pay to unlock)
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
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Lead', leadSchema);


