const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Current user profile
router.get('/me', authController.protect, authController.getMe);
router.patch('/me', authController.protect, authController.updateMe);

module.exports = router;





