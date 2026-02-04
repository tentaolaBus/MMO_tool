import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, checkRole } from '../middleware/auth';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login and get JWT token
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private (requires JWT)
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route   GET /api/auth/admin-test
 * @desc    Test admin-only route
 * @access  Private (admin only)
 */
router.get('/admin-test', authenticate, checkRole('admin'), (req, res) => {
    res.json({
        success: true,
        message: 'Welcome, Admin!',
        user: req.user
    });
});

export default router;
