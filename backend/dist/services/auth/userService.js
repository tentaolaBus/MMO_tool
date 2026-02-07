"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
exports.initUsersTable = initUsersTable;
exports.createUser = createUser;
exports.findByEmail = findByEmail;
exports.findByUsername = findByUsername;
exports.findById = findById;
exports.toUserResponse = toUserResponse;
const database_1 = require("../database");
const authService_1 = require("./authService");
/**
 * Initialize users table
 */
function initUsersTable() {
    database_1.db.exec(`
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
const insertUserStmt = database_1.db.prepare(`
    INSERT INTO users (username, email, password, role)
    VALUES (?, ?, ?, ?)
`);
const findByEmailStmt = database_1.db.prepare(`
    SELECT * FROM users WHERE email = ?
`);
const findByUsernameStmt = database_1.db.prepare(`
    SELECT * FROM users WHERE username = ?
`);
const findByIdStmt = database_1.db.prepare(`
    SELECT * FROM users WHERE id = ?
`);
/**
 * Create new user
 */
async function createUser(userData) {
    // Hash password
    const hashedPassword = await authService_1.authService.hashPassword(userData.password);
    // Insert user
    const result = insertUserStmt.run(userData.username, userData.email, hashedPassword, userData.role || 'user');
    // Return user without password
    return {
        id: result.lastInsertRowid,
        username: userData.username,
        email: userData.email,
        role: userData.role || 'user',
        created_at: new Date().toISOString()
    };
}
/**
 * Find user by email
 */
function findByEmail(email) {
    return findByEmailStmt.get(email);
}
/**
 * Find user by username
 */
function findByUsername(username) {
    return findByUsernameStmt.get(username);
}
/**
 * Find user by ID
 */
function findById(id) {
    return findByIdStmt.get(id);
}
/**
 * Convert User to UserResponse (excludes password)
 */
function toUserResponse(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at
    };
}
exports.userService = {
    initUsersTable,
    createUser,
    findByEmail,
    findByUsername,
    findById,
    toUserResponse
};
