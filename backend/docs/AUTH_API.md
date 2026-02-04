# JWT Authentication API - Postman Collection

## Base URL
```
http://localhost:3001/api/auth
```

---

## 1. Register User

**POST** `/register`

### Request Body
```json
{
    "username": "player1",
    "email": "player1@game.com",
    "password": "SecurePass123!"
}
```

### Success Response (201)
```json
{
    "success": true,
    "message": "User registered successfully.",
    "user": {
        "id": 1,
        "username": "player1",
        "email": "player1@game.com",
        "role": "user",
        "created_at": "2026-02-03T10:30:00.000Z"
    }
}
```

### Error Response (409 - Email exists)
```json
{
    "success": false,
    "message": "Email already registered."
}
```

---

## 2. Login

**POST** `/login`

### Request Body
```json
{
    "email": "player1@game.com",
    "password": "SecurePass123!"
}
```

### Success Response (200)
```json
{
    "success": true,
    "message": "Login successful.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": 1,
        "username": "player1",
        "email": "player1@game.com",
        "role": "user",
        "created_at": "2026-02-03T10:30:00.000Z"
    }
}
```

### Error Response (401 - Wrong password)
```json
{
    "success": false,
    "message": "Invalid email or password."
}
```

---

## 3. Get Current User (Protected)

**GET** `/me`

### Headers
```
Authorization: Bearer <your_jwt_token>
```

### Success Response (200)
```json
{
    "success": true,
    "user": {
        "id": 1,
        "username": "player1",
        "email": "player1@game.com",
        "role": "user",
        "created_at": "2026-02-03T10:30:00.000Z"
    }
}
```

### Error Response (401 - No token)
```json
{
    "success": false,
    "message": "Access denied. No token provided."
}
```

---

## 4. Admin Test Route (Admin Only)

**GET** `/admin-test`

### Headers
```
Authorization: Bearer <admin_jwt_token>
```

### Success Response (200)
```json
{
    "success": true,
    "message": "Welcome, Admin!",
    "user": {
        "userId": 1,
        "username": "admin",
        "role": "admin"
    }
}
```

### Error Response (403 - Not admin)
```json
{
    "success": false,
    "message": "Access denied. Required role: admin"
}
```

---

## Postman Environment Variables

| Variable | Value |
|----------|-------|
| `base_url` | `http://localhost:3001/api/auth` |
| `token` | (Set after login) |

## Test Flow

1. **Register** → Create new user
2. **Login** → Get JWT token, save to `token` variable
3. **Get Me** → Use token in Authorization header
4. **Admin Test** → Create admin user, login, test admin route
