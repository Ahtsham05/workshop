# Vercel Deployment Guide

## Backend Deployment Issues Fixed

### Changes Made:

1. **Created `/api/index.js`** - Vercel serverless entry point
2. **Updated `vercel.json`** - Points to correct API handler
3. **CORS configured** - Already allows `*.vercel.app` domains

### Environment Variables Required on Vercel Backend:

Go to your backend project on Vercel → Settings → Environment Variables and add:

```
NODE_ENV=production
MONGODB_URL=mongodb+srv://ahtshamyounas0321:NSIfPYgDBqEsamOE@cluster0.zh3pjqw.mongodb.net/workshop
JWT_SECRET=thisisasamplesecret
JWT_ACCESS_EXPIRATION_MINUTES=300000
JWT_REFRESH_EXPIRATION_DAYS=30
JWT_RESET_PASSWORD_EXPIRATION_MINUTES=10
JWT_VERIFY_EMAIL_EXPIRATION_MINUTES=10
CLOUDINARY_CLOUD_NAME=da2kbpyuu
CLOUDINARY_API_KEY=421915721122732
CLOUDINARY_API_SECRET=6kvmdOZMROReBlEuPqwpatieE14
FRONTEND_URL=https://786engineeringworks.vercel.app
PORT=3000
```

### Environment Variables Required on Vercel Frontend:

Go to your frontend project on Vercel → Settings → Environment Variables and add:

```
VITE_BACKEND_URL=https://your-backend-app.vercel.app/v1
```

**Important:** Replace `your-backend-app.vercel.app` with your actual backend Vercel URL.

### API Endpoints Structure:

Your backend uses `/v1` prefix, so all endpoints are:
- `/v1/auth/login`
- `/v1/auth/register`
- `/v1/products`
- `/v1/invoices`
- etc.

### Testing After Deployment:

1. Test backend health:
   ```
   https://your-backend-app.vercel.app/
   ```
   Should return: "Hello World!"

2. Test login endpoint:
   ```
   POST https://your-backend-app.vercel.app/v1/auth/login
   Body: {
     "email": "786engeeneringworks@gmail.com",
     "password": "786@786A"
   }
   ```

### Common Issues:

1. **404 Not Found**: 
   - Make sure frontend uses `/v1` prefix
   - Check `VITE_BACKEND_URL` includes `/v1`

2. **CORS Error**:
   - Backend already configured for `*.vercel.app`
   - Make sure frontend URL is set in backend env vars

3. **500 Internal Error**:
   - Check MongoDB connection
   - Verify all environment variables are set

### Deployment Steps:

1. **Deploy Backend:**
   ```bash
   cd server
   git push  # or use Vercel CLI
   ```

2. **Deploy Frontend:**
   ```bash
   cd client
   git push  # or use Vercel CLI
   ```

3. **After deployment:**
   - Set environment variables on both projects
   - Redeploy both to apply env vars
   - Test API endpoints

### Vercel CLI Deployment (Alternative):

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy backend
cd server
vercel --prod

# Deploy frontend
cd ../client
vercel --prod
```
