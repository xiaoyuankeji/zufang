const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const Lead = require('../models/Lead');

async function main() {
  const DB =
    process.env.DATABASE ||
    'mongodb://127.0.0.1:27018/lierzufang_landlord';

  console.log('[init_review_fields] Connecting:', DB);
  await mongoose.connect(DB, { serverSelectionTimeoutMS: 5000 });
  console.log('[init_review_fields] Connected');

  const r1 = await Listing.updateMany(
    { reviewStatus: { $exists: false } },
    { $set: { reviewStatus: 'pending', reviewNote: '' } }
  );
  const r2 = await Lead.updateMany(
    { reviewStatus: { $exists: false } },
    { $set: { reviewStatus: 'pending', reviewNote: '' } }
  );

  console.log('[init_review_fields] Listings updated:', r1.modifiedCount ?? r1.nModified ?? 0);
  console.log('[init_review_fields] Leads updated:', r2.modifiedCount ?? r2.nModified ?? 0);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[init_review_fields] Fatal:', err);
  process.exit(1);
});





