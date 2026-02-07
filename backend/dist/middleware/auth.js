"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
exports.authenticate = authenticate;
exports.checkRole = checkRole;
exports.optionalAuth = optionalAuth;
const authService_1 = require("../services/auth/authService");
/**
 * Middleware: Authenticate JWT token
 * Extracts token from Authorization header: "Bearer <token>"
 * Sets req.user with decoded payload
 */
function authenticate(req, res, next) {
    try {
        // Get Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
            return;
        }
        // Extract token
        const token = authHeader.substring(7); // Remove "Bearer "
        // Verify token
        const decoded = authService_1.authService.verifyToken(token);
        if (!decoded) {
            res.status(401).json({
                success: false,
                message: 'Invalid or expired token.'
            });
            return;
        }
        // Attach user to request
        req.user = decoded;
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({
            success: false,
            message: 'Authentication failed.'
        });
    }
}
/**
 * Middleware: Check user role
 * Must be used AFTER authenticate middleware
 * @param roles - Allowed roles (e.g., 'admin', 'moderator')
 */
function checkRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(' or ')}`
            });
            return;
        }
        next();
    };
}
/**
 * Middleware: Optional authentication
 * Doesn't fail if no token, but sets req.user if valid token exists
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = authService_1.authService.verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }
    next();
}
exports.authMiddleware = {
    authenticate,
    checkRole,
    optionalAuth
};
