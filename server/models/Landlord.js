const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const landlordSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['landlord', 'admin'],
    default: 'landlord'
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    select: false // Default to not returning password
  },
  name: {
    type: String,
    default: 'Landlord'
  },
  wechatId: {
    type: String,
    required: true
  },
  // 账户余额（用于扣费查看线索）
  balance: {
    type: Number,
    default: 0
  },
  // 会员状态
  membership: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  membershipExpiresAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
landlordSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to check password
landlordSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model('Landlord', landlordSchema);


