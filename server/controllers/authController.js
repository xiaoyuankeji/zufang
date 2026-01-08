const Landlord = require('../models/Landlord');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret-for-dev-only-change-in-prod', {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d'
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined; // Remove password from output

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

exports.signup = async (req, res, next) => {
  try {
    const newUser = await Landlord.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      wechatId: req.body.wechatId,
      balance: 10 // Sign-up bonus: 10 Euro
    });

    createSendToken(newUser, 201, res);
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({ status: 'fail', message: 'Please provide email and password' });
    }

    // 2) Check if user exists && password is correct
    const user = await Landlord.findOne({ email }).select('+password');

    // MOCK DB COMPATIBILITY FIX:
    let isCorrect = false;
    if (global.useMockDB) {
        // In mock mode, we skip strict bcrypt check or check plaintext
        // Because our mockDB implementation handles correctPassword logic loosely
        isCorrect = await user.correctPassword(password, user.password);
    } else {
        if (user) {
            isCorrect = await user.correctPassword(password, user.password);
        }
    }

    if (!user || !isCorrect) {
      return res.status(401).json({ status: 'fail', message: 'Incorrect email or password' });
    }

    // 3) If everything ok, send token to client
    createSendToken(user, 200, res);
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

exports.protect = async (req, res, next) => {
  try {
    // 1) Getting token and check of it's there
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'You are not logged in!' });
    }

    // 2) Verification token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-for-dev-only-change-in-prod');

    // 3) Check if user still exists
    const currentUser = await Landlord.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ status: 'fail', message: 'The user belonging to this token no longer exists.' });
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
  } catch (err) {
    res.status(401).json({ status: 'fail', message: 'Invalid token' });
  }
};

// Optional auth: attach req.user if token exists & valid, but don't block when missing/invalid.
exports.optionalProtect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-for-dev-only-change-in-prod');
    const currentUser = await Landlord.findById(decoded.id);
    if (currentUser) req.user = currentUser;
    return next();
  } catch (err) {
    return next();
  }
};

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ status: 'fail', message: 'Forbidden' });
  }
  next();
};

// --- Profile ---
exports.getMe = async (req, res) => {
  try {
    // req.user is attached by protect()
    res.status(200).json({
      status: 'success',
      data: { user: req.user }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: err?.message || String(err) });
  }
};

exports.updateMe = async (req, res) => {
  try {
    // Disallow password update here (keep scope small & safe)
    if (req.body?.password || req.body?.passwordConfirm) {
      return res.status(400).json({ status: 'fail', message: 'Password update is not supported here.' });
    }

    const allowed = ['name', 'email', 'wechatId'];
    const updates = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) updates[k] = req.body[k];
    }

    const user = await Landlord.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (err) {
    // Duplicate key (email unique)
    if (err?.code === 11000) {
      return res.status(400).json({ status: 'fail', message: '该邮箱已被使用，请换一个。' });
    }
    res.status(400).json({ status: 'fail', message: err?.message || String(err) });
  }
};

