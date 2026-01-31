# Error Handling Standards

## ✅ Implementation Complete

### **Custom Error Classes**

Located in `src/utils/errors.ts`:

```typescript
// Base error
throw new AppError('Something went wrong', 500, { jobId: '123' });

// Specific errors
throw new ValidationError('Invalid input');
throw new NotFoundError('Job', jobId);
throw new DatabaseError('Failed to insert clip');
throw new FFmpegError('Failed to render video');
throw new TranscriptError('Invalid transcript format');
```

### **Error Response Format**

All errors return consistent JSON:

```json
{
  "success": false,
  "error": {
    "message": "Job not found: abc-123",
    "statusCode": 404,
    "type": "NotFoundError",
    "context": {
      "resource": "Job",
      "id": "abc-123",
      "jobId": "abc-123"
    },
    "stack": "..." // Only in development
  },
  "timestamp": "2026-01-31T08:53:00.000Z",
  "path": "/api/jobs/abc-123",
  "method": "GET"
}
```

### **Error Logging**

All errors logged with context:

```
❌ === ERROR ===
📍 Route: POST /api/clips/render
🔢 Status: 500
💬 Message: FFmpeg error: Failed to encode video
📋 Context: {
  "jobId": "abc-123",
  "clipId": "xyz-789"
}
📚 Stack: ...
================
```

### **Protected Routes**

Use `asyncHandler` to catch promise rejections:

```typescript
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError } from '../utils/errors';

router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!id) {
        throw new ValidationError('ID is required');
    }
    
    const job = await getJob(id);
    if (!job) {
        throw new NotFoundError('Job', id);
    }
    
    res.json({ success: true, job });
    // Any promise rejection auto-caught!
}));
```

### **Global Handlers**

Registered in `src/index.ts`:

1. **Error middleware** (catches all thrown errors)
2. **404 handler** (catches undefined routes)
3. **Unhandled rejection** handler (catches Promise.reject outside routes)
4. **Uncaught exception** handler (catches synchronous errors)

---

## 📋 Migration Checklist

To migrate existing routes:

- [ ] Wrap async handlers with `asyncHandler()`
- [ ] Replace `res.status(400).json({ success: false, message: '...' })` with `throw new ValidationError('...')`
- [ ] Replace `res.status(404).json(...)` with `throw new NotFoundError('Resource', id)`
- [ ] Add context to errors: `throw new FFmpegError('...', { jobId, clipId })`
- [ ] Remove try/catch blocks that just return 500 (let middleware handle it)

---

## 🎯 Before & After

### **Before:**
```typescript
router.post('/render', async (req, res) => {
    try {
        const { jobId } = req.body;
        const job = getJob(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }
        // ... more code
    } catch (error: any) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
```

### **After:**
```typescript
router.post('/render', asyncHandler(async (req, res) => {
    const { jobId } = req.body;
    
    if (!jobId) {
        throw new ValidationError('jobId is required');
    }
    
    const job = getJob(jobId);
    if (!job) {
        throw new NotFoundError('Job', jobId);
    }
    
    // ... more code
    // All errors auto-caught and logged with context!
}));
```

---

## ✅ Benefits

| Before | After |
|--------|-------|
| ❌ Inconsistent error responses | ✅ Standard format |
| ❌ Missing context in logs | ✅ jobId, clipId, route logged |
| ❌ Unhandled promise rejections | ✅ Global handler catches all |
| ❌ Try/catch everywhere | ✅ asyncHandler wraps routes |
| ❌ Raw 500 errors | ✅ Meaningful status codes |

---

## 🚀 Next Steps

The infrastructure is ready. Routes can now be migrated incrementally. The middleware will catch errors from both migrated and unmigrated routes.
