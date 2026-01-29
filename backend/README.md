# Backend - Node.js API Server

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Server will run on http://localhost:3001

## API Endpoints

### Upload Video
```
POST /api/upload
Content-Type: multipart/form-data
Body: video (file)
```

### Get Job Status
```
GET /api/jobs/:jobId
```

### Get All Jobs (Debug)
```
GET /api/jobs
```

## Environment Variables

Create a `.env` file:
```
PORT=3001
AI_SERVICE_URL=http://localhost:5000
```
