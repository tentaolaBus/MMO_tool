import { supabase } from '../database';
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
 * Initialize users table (no-op for Supabase — table created via SQL Editor)
 */
export function initUsersTable(): void {
    console.log('✅ Users table initialized (Supabase — already exists)');
}

/**
 * Create new user
 */
export async function createUser(userData: CreateUserDTO): Promise<UserResponse> {
    const hashedPassword = await authService.hashPassword(userData.password);

    const { data, error } = await supabase
        .from('users')
        .insert({
            username: userData.username,
            email: userData.email,
            password: hashedPassword,
            role: userData.role || 'user',
        })
        .select('id, username, email, role, created_at')
        .single();

    if (error) throw new Error(`createUser failed: ${error.message}`);

    return data as UserResponse;
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error && error.code !== 'PGRST116') throw new Error(`findByEmail failed: ${error.message}`);
    return (data as User) || undefined;
}

/**
 * Find user by username
 */
export async function findByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error && error.code !== 'PGRST116') throw new Error(`findByUsername failed: ${error.message}`);
    return (data as User) || undefined;
}

/**
 * Find user by ID
 */
export async function findById(id: number): Promise<User | undefined> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

    if (error && error.code !== 'PGRST116') throw new Error(`findById failed: ${error.message}`);
    return (data as User) || undefined;
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
