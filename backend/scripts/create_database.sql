# SQL Server Installation Script
# Run this SQL in SQL Server Management Studio (SSMS) or Azure Data Studio

-- Create Database (run as admin)
CREATE DATABASE mmo_game;
GO

USE mmo_game;
GO

-- Create users table
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) UNIQUE NOT NULL,
    email NVARCHAR(100) UNIQUE NOT NULL,
    password NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) DEFAULT 'user' NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- Create indexes for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Optional: Create admin user (password will be hashed by application)
-- INSERT INTO users (username, email, password, role) 
-- VALUES ('admin', 'admin@game.com', 'hashed_password_here', 'admin');

PRINT 'Database and tables created successfully!';
GO
