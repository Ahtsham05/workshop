# Authentication Debug Guide

## Issue: 401 Unauthorized when saving invoices

The invoice API is returning a 401 Unauthorized error, which means the authentication token is not being sent correctly or is invalid.

## Debug Steps:

### 1. Check Authentication Status
Open browser developer tools and run in console:
```javascript
// Check if tokens exist
console.log('Access Token:', localStorage.getItem('accessToken'))
console.log('Refresh Token:', localStorage.getItem('refreshToken'))

// Check if user is authenticated
console.log('User Data:', JSON.parse(localStorage.getItem('user') || 'null'))
```

### 2. Check API Request Headers
In Network tab of developer tools:
1. Try to save an invoice
2. Look for the POST request to `/v1/invoices`
3. Check the Request Headers section
4. Verify there's an `Authorization: Bearer <token>` header

### 3. Test Token Manually
Copy the access token and test it manually:
```bash
curl -X POST http://localhost:3000/v1/invoices \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### 4. Check Server Logs
Look at the server console for any authentication errors.

## Fixes Applied:

1. **Updated RTK Query baseQuery** - Now uses `localStorage.getItem('accessToken')` instead of trying to get token from Redux state

2. **Added Authentication Check** - Invoice save function now checks if token exists before making the request

3. **Enhanced Error Handling** - Better error messages for authentication failures

## Test the Fix:

1. Make sure you're logged in
2. Check that `localStorage.getItem('accessToken')` returns a valid token
3. Try saving an invoice again
4. Check the Network tab to see if the Authorization header is present

If still getting 401:
- The token might be expired - try logging out and logging back in
- The server might not be running - check server logs
- The token format might be wrong - compare with working requests from other parts of the app
