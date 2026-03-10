"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
exports.register = register;
exports.login = login;
exports.getMe = getMe;
const authService_1 = require("../services/auth/authService");
// Use Supabase user service
const userService_1 = require("../services/auth/userService");
/**
 * POST /api/auth/register
 * Register a new user
 */
async function register(req, res) {
    try {
        const { username, email, password, role } = req.body;
        // Validate input
        if (!username || !email || !password) {
            res.status(400).json({
                success: false,
                message: 'Username, email, and password are required.'
            });
            return;
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({
                success: false,
                message: 'Invalid email format.'
            });
            return;
        }
        // Validate password length
        if (password.length < 6) {
            res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters.'
            });
            return;
        }
        // Check if user already exists
        const existingEmail = await userService_1.userService.findByEmail(email);
        if (existingEmail) {
            res.status(409).json({
                success: false,
                message: 'Email already registered.'
            });
            return;
        }
        const existingUsername = await userService_1.userService.findByUsername(username);
        if (existingUsername) {
            res.status(409).json({
                success: false,
                message: 'Username already taken.'
            });
            return;
        }
        // Create user
        const userData = {
            username,
            email,
            password,
            role: role || 'user' // Default role
        };
        const user = await userService_1.userService.createUser(userData);
        console.log(`✅ New user registered: ${username} (${email})`);
        res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            user
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Registration failed.'
        });
    }
}
/**
 * POST /api/auth/login
 * Login and return JWT token
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;
        // Validate input
        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
            return;
        }
        // Find user by email
        const user = await userService_1.userService.findByEmail(email);
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
            return;
        }
        // Compare password
        const isPasswordValid = await authService_1.authService.comparePassword(password, user.password);
        if (!isPasswordValid) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
            return;
        }
        // Generate JWT token
        const token = authService_1.authService.generateToken({
            userId: user.id,
            username: user.username,
            role: user.role
        });
        console.log(`✅ User logged in: ${user.username}`);
        res.json({
            success: true,
            message: 'Login successful.',
            token,
            user: userService_1.userService.toUserResponse(user)
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Login failed.'
        });
    }
}
/**
 * GET /api/auth/me
 * Get current user info (protected route)
 */
async function getMe(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
            return;
        }
        // Get full user from database
        const user = await userService_1.userService.findById(req.user.userId);
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found.'
            });
            return;
        }
        res.json({
            success: true,
            user: userService_1.userService.toUserResponse(user)
        });
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get user info.'
        });
    }
}
exports.authController = {
    register,
    login,
    getMe
};
