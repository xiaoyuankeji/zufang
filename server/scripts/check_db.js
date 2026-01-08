const mongoose = require('mongoose');

async function main() {
  const uri = process.env.DATABASE || 'mongodb://127.0.0.1:27018/lierzufang_landlord';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  const cols = await mongoose.connection.db.listCollections().toArray();
  console.log('MongoDB connected:', uri);
  console.log('Collections:', cols.map((c) => c.name));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('DB check failed:', err?.message || err);
  process.exit(1);
});






