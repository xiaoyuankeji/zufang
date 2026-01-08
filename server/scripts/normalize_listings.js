const mongoose = require('mongoose');
const Listing = require('../models/Listing');

async function main() {
  const DB =
    process.env.DATABASE ||
    'mongodb://127.0.0.1:27018/lierzufang_landlord';

  console.log('[normalize_listings] Connecting:', DB);
  await mongoose.connect(DB, { serverSelectionTimeoutMS: 5000 });
  console.log('[normalize_listings] Connected');

  const listings = await Listing.find({});
  console.log('[normalize_listings] Total listings:', listings.length);

  let updated = 0;
  for (const l of listings) {
    let changed = false;

    // Normalize tags: if single string contains separators, split it.
    if (Array.isArray(l.tags) && l.tags.length === 1) {
      const s = String(l.tags[0] || '');
      if (/[,\uFF0C]/.test(s)) {
        const parts = s
          .split(/[,\uFF0C]+/g)
          .map((t) => t.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          l.tags = parts;
          changed = true;
        }
      }
    }

    // Ensure images is array
    if (!Array.isArray(l.images)) {
      l.images = [];
      changed = true;
    }

    // Drop empty image strings
    if (Array.isArray(l.images) && l.images.some((x) => !x || !String(x).trim())) {
      l.images = l.images.map((x) => String(x || '').trim()).filter(Boolean);
      changed = true;
    }

    if (changed) {
      await l.save();
      updated += 1;
      console.log('[normalize_listings] Updated:', l._id.toString());
    }
  }

  console.log('[normalize_listings] Done. Updated:', updated);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[normalize_listings] Fatal:', err);
  process.exit(1);
});





