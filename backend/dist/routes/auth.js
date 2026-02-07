"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authController_1.authController.register);
/**
 * @route   POST /api/auth/login
 * @desc    Login and get JWT token
 * @access  Public
 */
router.post('/login', authController_1.authController.login);
/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private (requires JWT)
 */
router.get('/me', auth_1.authenticate, authController_1.authController.getMe);
/**
 * @route   GET /api/auth/admin-test
 * @desc    Test admin-only route
 * @access  Private (admin only)
 */
router.get('/admin-test', auth_1.authenticate, (0, auth_1.checkRole)('admin'), (req, res) => {
    res.json({
        success: true,
        message: 'Welcome, Admin!',
        user: req.user
    });
});
exports.default = router;
