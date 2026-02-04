import { db } from '../database';
import { authService } from './authService';

export interface User {
    id: number;
    username: string;
    email: string;
    password: string;
    role: string;
    created_at: string;
    updated_at: string;
}

export interface CreateUserDTO {
    username: string;
    email: string;
    password: string;
    role?: string;
}

export interface UserResponse {
    id: number;
    username: string;
    email: string;
    role: string;
    created_at: string;
}

/**
 * Initialize users table
 */
export function initUsersTable(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
    console.log('✅ Users table initialized');
}

// Prepared statements
const insertUserStmt = db.prepare(`
    INSERT INTO users (username, email, password, role)
    VALUES (?, ?, ?, ?)
`);

const findByEmailStmt = db.prepare(`
    SELECT * FROM users WHERE email = ?
`);

const findByUsernameStmt = db.prepare(`
    SELECT * FROM users WHERE username = ?
`);

const findByIdStmt = db.prepare(`
    SELECT * FROM users WHERE id = ?
`);

/**
 * Create new user
 */
export async function createUser(userData: CreateUserDTO): Promise<UserResponse> {
    // Hash password
    const hashedPassword = await authService.hashPassword(userData.password);

    // Insert user
    const result = insertUserStmt.run(
        userData.username,
        userData.email,
        hashedPassword,
        userData.role || 'user'
    );

    // Return user without password
    return {
        id: result.lastInsertRowid as number,
        username: userData.username,
        email: userData.email,
        role: userData.role || 'user',
        created_at: new Date().toISOString()
    };
}

/**
 * Find user by email
 */
export function findByEmail(email: string): User | undefined {
    return findByEmailStmt.get(email) as User | undefined;
}

/**
 * Find user by username
 */
export function findByUsername(username: string): User | undefined {
    return findByUsernameStmt.get(username) as User | undefined;
}

/**
 * Find user by ID
 */
export function findById(id: number): User | undefined {
    return findByIdStmt.get(id) as User | undefined;
}

/**
 * Convert User to UserResponse (excludes password)
 */
export function toUserResponse(user: User): UserResponse {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at
    };
}

export const userService = {
    initUsersTable,
    createUser,
    findByEmail,
    findByUsername,
    findById,
    toUserResponse
};
