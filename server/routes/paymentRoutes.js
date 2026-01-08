const express = require('express');
const authController = require('../controllers/authController');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.use(authController.protect);

router.post('/topup', paymentController.topUp);
router.get('/my', paymentController.getMyPayments);

// Stripe (real test payment)
router.post('/stripe/checkout-session', paymentController.createStripeCheckoutSession);
router.get('/stripe/confirm', paymentController.confirmStripeCheckoutSession);
router.post('/stripe/reconcile', paymentController.reconcileStripeDeposits);

module.exports = router;





