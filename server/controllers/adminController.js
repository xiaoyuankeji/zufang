const Listing = require('../models/Listing');
const Lead = require('../models/Lead');

function normalizeStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'approved' || v === 'rejected' || v === 'pending') return v;
  return null;
}

exports.getPendingSummary = async (req, res) => {
  try {
    const [listingsPending, leadsPending] = await Promise.all([
      Listing.countDocuments({ reviewStatus: 'pending' }),
      Lead.countDocuments({ reviewStatus: 'pending' })
    ]);

    res.status(200).json({
      status: 'success',
      data: { listingsPending, leadsPending }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

exports.getListingsForReview = async (req, res) => {
  try {
    const status = normalizeStatus(req.query.status) || 'pending';
    const listings = await Listing.find({ reviewStatus: status })
      .populate({ path: 'landlord', select: 'name wechatId email' })
      .sort('-createdAt')
      .limit(200);
    res.status(200).json({ status: 'success', results: listings.length, data: { listings } });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

exports.reviewListing = async (req, res) => {
  try {
    const status = normalizeStatus(req.body.status);
    const note = String(req.body.note || '').slice(0, 500);
    if (!status || status === 'pending') {
      return res.status(400).json({ status: 'fail', message: 'Invalid review status' });
    }

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ status: 'fail', message: 'Listing not found' });

    listing.reviewStatus = status;
    listing.reviewNote = note;
    listing.reviewedAt = new Date();
    listing.reviewedBy = req.user.id;
    await listing.save();

    res.status(200).json({ status: 'success', data: { listing } });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

exports.getLeadsForReview = async (req, res) => {
  try {
    const status = normalizeStatus(req.query.status) || 'pending';
    // Admin can see full contact info
    const leads = await Lead.find({ reviewStatus: status }).sort('-createdAt').limit(200);
    res.status(200).json({ status: 'success', results: leads.length, data: { leads } });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};

exports.reviewLead = async (req, res) => {
  try {
    const status = normalizeStatus(req.body.status);
    const note = String(req.body.note || '').slice(0, 500);
    if (!status || status === 'pending') {
      return res.status(400).json({ status: 'fail', message: 'Invalid review status' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ status: 'fail', message: 'Lead not found' });

    lead.reviewStatus = status;
    lead.reviewNote = note;
    lead.reviewedAt = new Date();
    lead.reviewedBy = req.user.id;
    await lead.save();

    res.status(200).json({ status: 'success', data: { lead } });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err.message });
  }
};





