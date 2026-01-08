const express = require('express');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo('admin'));

router.get('/summary', adminController.getPendingSummary);

router.get('/listings', adminController.getListingsForReview);
router.patch('/listings/:id/review', adminController.reviewListing);

router.get('/leads', adminController.getLeadsForReview);
router.patch('/leads/:id/review', adminController.reviewLead);

module.exports = router;





