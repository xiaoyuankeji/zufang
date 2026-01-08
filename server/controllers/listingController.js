const Listing = require('../models/Listing');
const Payment = require('../models/Payment');

const PROMOTE_PRICE = 10; // 10 EUR / 7 days (demo pricing)

// 1. 获取所有房源 (用于前端展示)
exports.getAllListings = async (req, res, next) => {
  try {
    // Expire promotions automatically (simple maintenance)
    const now = new Date();
    await Listing.updateMany(
      { isPromoted: true, promotedUntil: { $ne: null, $lte: now } },
      { $set: { isPromoted: false, promotedUntil: null } }
    );

    const listings = await Listing.find({ isActive: true, reviewStatus: 'approved' }).sort('-isPromoted -createdAt');
    res.status(200).json({
      status: 'success',
      results: listings.length,
      data: { listings }
    });
  } catch (err) {
    res.status(404).json({ status: 'fail', message: err.message });
  }
};

// 2. 获取我的房源 (用于房东后台)
exports.getMyListings = async (req, res, next) => {
  try {
    const listings = await Listing.find({ landlord: req.user.id });
    res.status(200).json({
      status: 'success',
      results: listings.length,
      data: { listings }
    });
  } catch (err) {
    res.status(404).json({ status: 'fail', message: err.message });
  }
};

// 3. 创建房源
exports.createListing = async (req, res, next) => {
  try {
    const newListing = await Listing.create({
      ...req.body,
      landlord: req.user.id,
      reviewStatus: 'pending'
    });
    res.status(201).json({
      status: 'success',
      data: { listing: newListing }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

// 4. 更新房源
exports.updateListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, landlord: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!listing) {
      return res.status(404).json({ status: 'fail', message: 'No listing found or not yours' });
    }

    res.status(200).json({
      status: 'success',
      data: { listing }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

// 5. 删除房源
exports.deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOneAndDelete({ _id: req.params.id, landlord: req.user.id });

    if (!listing) {
      return res.status(404).json({ status: 'fail', message: 'No listing found or not yours' });
    }

    // 统一返回 success，便于前端处理
    res.status(200).json({ status: 'success', data: null });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

// 6. 获取单个房源详情
exports.getListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate({
      path: 'landlord',
      select: 'name wechatId email' // 仅返回公开信息
    });

    if (!listing) {
      return res.status(404).json({ status: 'fail', message: 'No listing found' });
    }

    // If listing not approved, only allow owner/admin preview
    const isOwner = req.user && String(listing.landlord?._id || listing.landlord) === String(req.user.id);
    const isAdmin = req.user && req.user.role === 'admin';
    if (listing.reviewStatus !== 'approved' && !isOwner && !isAdmin) {
      return res.status(404).json({ status: 'fail', message: 'No listing found' });
    }

    res.status(200).json({
      status: 'success',
      data: { listing }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

// 7. 置顶/推荐房源（扣余额）
exports.promoteListing = async (req, res) => {
  try {
    const days = Number(req.body?.days || 7);
    const price = Number(req.body?.price || PROMOTE_PRICE);

    if (!Number.isFinite(days) || days <= 0 || days > 90) {
      return res.status(400).json({ status: 'fail', message: 'Invalid days' });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ status: 'fail', message: 'Invalid price' });
    }

    const listing = await Listing.findOne({ _id: req.params.id, landlord: req.user.id });
    if (!listing) {
      return res.status(404).json({ status: 'fail', message: 'No listing found or not yours' });
    }

    if (listing.reviewStatus !== 'approved') {
      return res.status(403).json({ status: 'fail', message: 'Listing pending review, cannot promote yet.' });
    }

    if (req.user.balance < price) {
      return res.status(402).json({
        status: 'fail',
        message: 'Insufficient balance. Please top up.',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    // Deduct balance
    req.user.balance -= price;
    await req.user.save({ validateBeforeSave: false });

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    listing.isPromoted = true;
    listing.promotedUntil = until;
    await listing.save();

    await Payment.create({
      landlord: req.user.id,
      amount: -price,
      currency: 'EUR',
      type: 'promote_listing',
      status: 'completed',
      targetId: listing.id
    });

    res.status(200).json({
      status: 'success',
      data: {
        listing,
        balance: req.user.balance
      }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};


