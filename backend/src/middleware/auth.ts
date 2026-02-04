import { Request, Response, NextFunction } from 'express';
import { authService, TokenPayload } from '../services/auth/authService';
import { userService } from '../services/auth/userService';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload & { email?: string };
        }
    }
}

/**
 * Middleware: Authenticate JWT token
 * Extracts token from Authorization header: "Bearer <token>"
 * Sets req.user with decoded payload
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
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
        const decoded = authService.verifyToken(token);

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

    } catch (error) {
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
export function checkRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
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
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = authService.verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }

    next();
}

export const authMiddleware = {
    authenticate,
    checkRole,
    optionalAuth
};
