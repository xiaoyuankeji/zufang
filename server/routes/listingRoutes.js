const express = require('express');
const listingController = require('../controllers/listingController');
const authController = require('../controllers/authController');

const router = express.Router();

// Public: Get all active listings
router.get('/', listingController.getAllListings);

// Protected: Landlord manages own listings
// 注意：必须把 /my 放在 /:id 之前，否则会被 /:id 吃掉
router.get('/my', authController.protect, listingController.getMyListings);
router.post('/', authController.protect, listingController.createListing);
router
  .route('/:id')
  .patch(authController.protect, listingController.updateListing)
  .delete(authController.protect, listingController.deleteListing);

// Promote listing (protected)
router.post('/:id/promote', authController.protect, listingController.promoteListing);

// Public: Listing detail (must be last to avoid swallowing static routes like /my)
router.get('/:id', authController.optionalProtect, listingController.getListing);

module.exports = router;


