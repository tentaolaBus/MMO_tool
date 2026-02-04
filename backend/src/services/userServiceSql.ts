import { getPool, sql } from '../config/sqlServer';
import { authService } from './auth/authService';

export interface User {
    id: number;
    username: string;
    email: string;
    password: string;
    role: string;
    created_at: Date;
    updated_at: Date;
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
 * Create new user in SQL Server
 */
export async function createUser(userData: CreateUserDTO): Promise<UserResponse> {
    const pool = await getPool();

    // Hash password
    const hashedPassword = await authService.hashPassword(userData.password);

    // Insert user and get inserted ID
    const result = await pool.request()
        .input('username', sql.NVarChar(50), userData.username)
        .input('email', sql.NVarChar(100), userData.email)
        .input('password', sql.NVarChar(255), hashedPassword)
        .input('role', sql.NVarChar(20), userData.role || 'user')
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
export async function findByEmail(email: string): Promise<User | undefined> {
    const pool = await getPool();

    const result = await pool.request()
        .input('email', sql.NVarChar(100), email)
        .query('SELECT * FROM users WHERE email = @email');

    return result.recordset[0] || undefined;
}

/**
 * Find user by username
 */
export async function findByUsername(username: string): Promise<User | undefined> {
    const pool = await getPool();

    const result = await pool.request()
        .input('username', sql.NVarChar(50), username)
        .query('SELECT * FROM users WHERE username = @username');

    return result.recordset[0] || undefined;
}

/**
 * Find user by ID
 */
export async function findById(id: number): Promise<User | undefined> {
    const pool = await getPool();

    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM users WHERE id = @id');

    return result.recordset[0] || undefined;
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
        created_at: user.created_at instanceof Date
            ? user.created_at.toISOString()
            : user.created_at
    };
}

export const userServiceSql = {
    createUser,
    findByEmail,
    findByUsername,
    findById,
    toUserResponse
};
