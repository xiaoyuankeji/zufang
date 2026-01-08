// Load env from server/.env first (boot scripts run node from repo root, so default dotenv path won't find it)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Fallback: also load from current working directory if present (optional)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const Landlord = require('./models/Landlord');
const paymentController = require('./controllers/paymentController');

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));

// Stripe webhook must use raw body and be mounted BEFORE express.json()
app.post('/api/v1/payments/stripe/webhook', express.raw({ type: 'application/json' }), paymentController.stripeWebhook);

app.use(express.json());

// Health check (dev)
app.get('/api/v1/health', (req, res) => {
  const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  res.status(200).json({
    status: 'success',
    data: {
      ok: true,
      time: new Date().toISOString(),
      port: process.env.PORT || 3001,
      stripe: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY)
      },
      mongo: {
        uri: process.env.DATABASE ? 'from_env' : 'default_local',
        state,
        connected: state === 1,
        db: mongoose.connection?.name || null
      }
    }
  });
});

// Database Connection (MongoDB local)
// If MongoDB isn't reachable, we'll fall back to mock mode.
const DB =
  process.env.DATABASE ||
  'mongodb://127.0.0.1:27018/lierzufang_landlord';

global.useMockDB = false;

mongoose
  .connect(DB, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    console.log('✅ DB connection successful!');

    // Dev bootstrap: ensure an admin account exists (local-only default)
    (async () => {
      try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@lierzufang.local';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
        const adminWechat = process.env.ADMIN_WECHAT || 'admin';

        const exists = await Landlord.findOne({ email: adminEmail });
        if (!exists) {
          await Landlord.create({
            role: 'admin',
            name: '管理员',
            email: adminEmail,
            password: adminPassword,
            wechatId: adminWechat,
            balance: 0
          });
          console.log('[ADMIN] Created admin account:', adminEmail);
        } else if (exists.role !== 'admin') {
          exists.role = 'admin';
          await exists.save({ validateBeforeSave: false });
          console.log('[ADMIN] Promoted existing user to admin:', adminEmail);
        }
        console.log('[ADMIN] Default admin email:', adminEmail);
      } catch (e) {
        console.warn('[ADMIN] Bootstrap failed:', e?.message || e);
      }
    })();
  })
  .catch((err) => {
    console.warn('------------------------------------------------');
    console.warn('WARNING: MongoDB connection failed.');
    console.warn('Switching to MOCK DATABASE mode.');
    console.warn(err?.message || err);
    console.warn('------------------------------------------------');
    global.useMockDB = true;
  });

// Routes (Placeholders for now)
app.get('/', (req, res) => {
  res.send('Lierzufang Landlord API is running...');
});

// Import Routes
const authRouter = require('./routes/authRoutes');
const leadRouter = require('./routes/leadRoutes');
const listingRouter = require('./routes/listingRoutes');
const paymentRouter = require('./routes/paymentRoutes');
const adminRouter = require('./routes/adminRoutes');
const paymentController = require('./controllers/paymentController');
const uploadController = require('./controllers/uploadController');
// path is already required above

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/leads', leadRouter);
app.use('/api/v1/listings', listingRouter);
app.use('/api/v1/payments', paymentRouter);
app.use('/api/v1/admin', adminRouter);

// Upload Route
app.post('/api/v1/upload', uploadController.uploadImage, uploadController.handleUpload);

// Serve Static Files (Uploaded Images)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// (payments routes moved to /api/v1/payments/*)

// Local admin endpoint (dev only): quickly inspect DB without Compass
app.get('/api/v1/admin/db', async (req, res) => {
  try {
    const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    const connected = state === 1;

    if (!connected) {
      return res.status(200).json({
        status: 'success',
        data: { connected: false, state }
      });
    }

    const cols = await mongoose.connection.db.listCollections().toArray();
    const names = cols.map((c) => c.name);

    const counts = {};
    for (const name of names) {
      counts[name] = await mongoose.connection.db.collection(name).countDocuments();
    }

    res.status(200).json({
      status: 'success',
      data: {
        connected: true,
        state,
        db: mongoose.connection.name,
        collections: names,
        counts
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err?.message || String(err) });
  }
});

// Start Server
const port = process.env.PORT || 3001; // Use 3001 to avoid conflict with React default 3000
app.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

