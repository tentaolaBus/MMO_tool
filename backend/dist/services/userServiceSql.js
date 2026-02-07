"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userServiceSql = void 0;
exports.createUser = createUser;
exports.findByEmail = findByEmail;
exports.findByUsername = findByUsername;
exports.findById = findById;
exports.toUserResponse = toUserResponse;
const sqlServer_1 = require("../config/sqlServer");
const authService_1 = require("./auth/authService");
/**
 * Create new user in SQL Server
 */
async function createUser(userData) {
    const pool = await (0, sqlServer_1.getPool)();
    // Hash password
    const hashedPassword = await authService_1.authService.hashPassword(userData.password);
    // Insert user and get inserted ID
    const result = await pool.request()
        .input('username', sqlServer_1.sql.NVarChar(50), userData.username)
        .input('email', sqlServer_1.sql.NVarChar(100), userData.email)
        .input('password', sqlServer_1.sql.NVarChar(255), hashedPassword)
        .input('role', sqlServer_1.sql.NVarChar(20), userData.role || 'user')
        .query(`
            INSERT INTO users (username, email, password, role)
            OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.role, INSERTED.created_at
            VALUES (@username, @email, @password, @role)
        `);
    const insertedUser = result.recordset[0];
    return {
        id: insertedUser.id,
        username: insertedUser.username,
        email: insertedUser.email,
        role: insertedUser.role,
        created_at: insertedUser.created_at.toISOString()
    };
}
/**
 * Find user by email
 */
async function findByEmail(email) {
    const pool = await (0, sqlServer_1.getPool)();
    const result = await pool.request()
        .input('email', sqlServer_1.sql.NVarChar(100), email)
        .query('SELECT * FROM users WHERE email = @email');
    return result.recordset[0] || undefined;
}
/**
 * Find user by username
 */
async function findByUsername(username) {
    const pool = await (0, sqlServer_1.getPool)();
    const result = await pool.request()
        .input('username', sqlServer_1.sql.NVarChar(50), username)
        .query('SELECT * FROM users WHERE username = @username');
    return result.recordset[0] || undefined;
}
/**
 * Find user by ID
 */
async function findById(id) {
    const pool = await (0, sqlServer_1.getPool)();
    const result = await pool.request()
        .input('id', sqlServer_1.sql.Int, id)
        .query('SELECT * FROM users WHERE id = @id');
    return result.recordset[0] || undefined;
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
        created_at: user.created_at instanceof Date
            ? user.created_at.toISOString()
            : user.created_at
    };
}
exports.userServiceSql = {
    createUser,
    findByEmail,
    findByUsername,
    findById,
    toUserResponse
};
