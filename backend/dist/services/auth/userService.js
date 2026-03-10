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
 * Initialize users table (no-op for Supabase — table created via SQL Editor)
 */
function initUsersTable() {
    console.log('✅ Users table initialized (Supabase — already exists)');
}
/**
 * Create new user
 */
async function createUser(userData) {
    const hashedPassword = await authService_1.authService.hashPassword(userData.password);
    const { data, error } = await database_1.supabase
        .from('users')
        .insert({
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        role: userData.role || 'user',
    })
        .select('id, username, email, role, created_at')
        .single();
    if (error)
        throw new Error(`createUser failed: ${error.message}`);
    return data;
}
/**
 * Find user by email
 */
async function findByEmail(email) {
    const { data, error } = await database_1.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
    if (error && error.code !== 'PGRST116')
        throw new Error(`findByEmail failed: ${error.message}`);
    return data || undefined;
}
/**
 * Find user by username
 */
async function findByUsername(username) {
    const { data, error } = await database_1.supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
    if (error && error.code !== 'PGRST116')
        throw new Error(`findByUsername failed: ${error.message}`);
    return data || undefined;
}
/**
 * Find user by ID
 */
async function findById(id) {
    const { data, error } = await database_1.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
    if (error && error.code !== 'PGRST116')
        throw new Error(`findById failed: ${error.message}`);
    return data || undefined;
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
