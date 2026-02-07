"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = void 0;
exports.getPool = getPool;
exports.closePool = closePool;
exports.initSqlServerDatabase = initSqlServerDatabase;
const mssql_1 = __importDefault(require("mssql"));
exports.sql = mssql_1.default;
// SQL Server configuration from environment variables
const sqlConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'mmo_game',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '1433'),
    options: {
        encrypt: false, // Set to true if using Azure
        trustServerCertificate: true, // For local development
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};
// Global connection pool
let pool = null;
/**
 * Get or create SQL Server connection pool
 */
async function getPool() {
    if (!pool) {
        try {
            pool = await mssql_1.default.connect(sqlConfig);
            console.log('✅ Connected to SQL Server:', sqlConfig.database);
        }
        catch (error) {
            console.error('❌ SQL Server connection failed:', error);
            throw error;
        }
    }
    return pool;
}
/**
 * Close SQL Server connection
 */
async function closePool() {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('📴 SQL Server connection closed');
    }
}
/**
 * Initialize database schema (creates users table if not exists)
 */
async function initSqlServerDatabase() {
    const pool = await getPool();
    try {
        // Create users table if not exists
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
            CREATE TABLE users (
                id INT IDENTITY(1,1) PRIMARY KEY,
                username NVARCHAR(50) UNIQUE NOT NULL,
                email NVARCHAR(100) UNIQUE NOT NULL,
                password NVARCHAR(255) NOT NULL,
                role NVARCHAR(20) DEFAULT 'user',
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE()
            );
        `);
        // Create indexes if not exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_email')
            CREATE INDEX idx_users_email ON users(email);
        `);
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_username')
            CREATE INDEX idx_users_username ON users(username);
        `);
        console.log('✅ SQL Server database schema initialized');
    }
    catch (error) {
        console.error('❌ Failed to initialize database schema:', error);
        throw error;
    }
}
exports.default = { getPool, closePool, initSqlServerDatabase };
