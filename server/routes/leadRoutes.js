const express = require('express');
const leadController = require('../controllers/leadController');
const authController = require('../controllers/authController');

const router = express.Router();

// Public route: Tenant submits lead
router.post('/', leadController.createLead);

// Protected routes: Landlord views/unlocks leads
router.use(authController.protect);
router.get('/', leadController.getAllLeads);
router.post('/:id/unlock', leadController.unlockLead);

module.exports = router;





