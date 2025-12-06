# Frontend Environment Variables for Vercel

## Required Environment Variable

Go to your frontend Vercel project → Settings → Environment Variables

Add the following:

**Variable Name:**
```
VITE_BACKEND_URL
```

**Variable Value:**
```
https://786server.vercel.app/v1
```

**IMPORTANT:** Make sure to include `/v1` at the end!

## Steps to Add:

1. Log in to Vercel Dashboard
2. Select your frontend project (786engineeringworks)
3. Go to **Settings** tab
4. Click **Environment Variables** in the left sidebar
5. Click **Add New**
6. Enter the variable name: `VITE_BACKEND_URL`
7. Enter the value: `https://786server.vercel.app/v1`
8. Select all environments: Production, Preview, Development
9. Click **Save**
10. Go to **Deployments** tab
11. Click the **three dots** (•••) on the latest deployment
12. Click **Redeploy**

## Why this is needed:

- Your frontend reads `import.meta.env.VITE_BACKEND_URL` to know where the API is
- Without this variable on Vercel, it defaults to `undefined` or empty
- This causes requests to go to wrong URLs (missing `/v1` prefix)
- All Vite environment variables must start with `VITE_` to be exposed to the browser

## Testing After Deployment:

After redeploying, your frontend login should work!
The request will go to: `https://786server.vercel.app/v1/auth/login` ✓

## Common Mistakes to Avoid:

❌ `https://786server.vercel.app` (missing /v1)
❌ `https://786server.vercel.app/` (missing v1)
❌ `BACKEND_URL` (missing VITE_ prefix)
✅ `https://786server.vercel.app/v1` (correct!)
