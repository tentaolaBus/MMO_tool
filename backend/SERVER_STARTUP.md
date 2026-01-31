# Backend Server Startup Guide

## ✅ Improvements Made

### 1. **Port Error Handling**
The server now catches `EADDRINUSE` and `EACCES` errors with helpful messages:

```
❌ ERROR: Port already in use!
   Port 3001 is already being used by another process.

💡 Solutions:
   1. Kill the process: netstat -ano | findstr :3001
      Then: taskkill /PID <PID> /F
   2. Change port in .env: PORT=<new_port>
   3. Stop other dev servers
```

### 2. **Better Logging**
Clear startup banner with all important info:

```
🚀 ===================================
   MMO Video Tool - Backend Server
   ===================================
   📡 Port:        3001
   🤖 AI Service:  http://localhost:5000
   📂 Storage:     ./storage
   ⏰ Started:     3:38:45 PM
   ===================================

✅ Job processor started
```

### 3. **Graceful Shutdown**
Properly closes all connections:
- HTTP server
- Job processor
- Database connection
- 10-second timeout for forced shutdown

---

## 🛠️ How to Avoid EADDRINUSE During Development

### **Problem:**
Multiple instances of the server try to listen on the same port (3001).

### **Solutions:**

#### **Option 1: Kill Existing Process (Windows)**
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Output shows PID (e.g., 7072)
TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    7072

# Kill the process
taskkill /PID 7072 /F
```

#### **Option 2: Change Port**
Create `.env` file in `/backend`:
```env
PORT=3002
AI_SERVICE_URL=http://localhost:5000
```

#### **Option 3: Stop Other Dev Servers**
Make sure you don't have:
- Multiple terminals running `npm run dev`
- Old Node processes still running
- Other apps using port 3001

---

## 🚀 Startup Flow

```
1. Module load
   ↓
2. Import database.ts → initDatabase() runs
   ↓
3. Create tables: jobs, clips
   ↓
4. Create prepared statements
   ↓
5. Setup Express routes
   ↓
6. server.listen(port)
   ↓
   ├─ Success → Show startup banner
   └─ Error → Show helpful error message + exit
```

---

## 📝 Configuration

Port is configurable via:
1. **Environment variable:** `PORT=3002 npm run dev`
2. **`.env` file:** `PORT=3002`
3. **Default:** `3001` (if not set)

---

## 🔄 Graceful Shutdown

**Ctrl+C** (SIGINT) or **Docker stop** (SIGTERM):
1. Close HTTP server (no new connections)
2. Stop job processor
3. Close database connection
4. Exit after 10 seconds max

---

## 🐛 Debugging Tips

### Check if server is running:
```bash
# Windows
netstat -ano | findstr :3001

# Should show:
# TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    <PID>
```

### Health check:
```bash
curl http://localhost:3001/health

# Should return:
# {"status":"ok","timestamp":"2026-01-31T08:38:00.000Z"}
```

### View logs:
The server now prints:
- ✅ Successful operations (green checkmarks)
- ❌ Errors (red X)
- 💡 Solutions (lightbulb)
- ⚠️  Warnings (warning sign)

---

## ✅ What Was Fixed

| Issue | Solution |
|-------|----------|
| Port already in use | Clear error message with solutions |
| Silent failures | Explicit error handling |
| No shutdown cleanup | Graceful shutdown with database close |
| Unclear logs | Formatted startup banner |
| Multiple instances | Caught and explained EADDRINUSE |

---

## 📋 Checklist for Clean Startup

- [ ] No other process on port 3001
- [ ] Database initialized successfully
- [ ] Job processor started
- [ ] Health endpoint responding
- [ ] Logs show "Backend Server" banner

**Server is ready when you see:** `✅ Job processor started`
