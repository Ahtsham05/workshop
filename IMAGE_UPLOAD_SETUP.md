# Image Upload Setup with Cloudinary

This guide will help you set up image upload functionality for products using Cloudinary.

## Prerequisites

1. A Cloudinary account (free tier available)
2. Server and client dependencies installed

## Setup Steps

### 1. Create Cloudinary Account

1. Go to [Cloudinary](https://cloudinary.com/) and sign up for a free account
2. After registration, go to your [Dashboard](https://cloudinary.com/console)
3. Copy your Cloud Name, API Key, and API Secret

### 2. Configure Server Environment Variables

Add these variables to your server's `.env` file:

```bash
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

Replace the values with your actual Cloudinary credentials.

### 3. Update Database Schema

The product schema has been updated to include an optional image field:

```javascript
image: {
    url: { type: String }, // Cloudinary URL
    publicId: { type: String } // Cloudinary public ID for deletion
}
```

### 4. Features Included

#### Server Features:
- Image upload to Cloudinary
- Automatic image deletion when products are deleted
- Image replacement when updating products
- File validation (image types only, 5MB max)
- Organized storage in 'products' folder on Cloudinary

#### Client Features:
- Drag & drop image upload
- Click to select image upload
- Image preview with remove option
- Upload progress indication
- Error handling
- Multi-language support (English/Urdu)

### 5. API Endpoints

#### Upload Image (Standalone)
```
POST /v1/products/upload-image
Content-Type: multipart/form-data
Body: image file
```

#### Delete Image (Standalone)
```
DELETE /v1/products/delete-image
Content-Type: application/json
Body: { "publicId": "cloudinary-public-id" }
```

#### Create Product with Image
```
POST /v1/products
Content-Type: multipart/form-data
Body: product data + image file
```

#### Update Product with Image
```
PATCH /v1/products/:productId
Content-Type: multipart/form-data
Body: product data + image file (optional)
```

### 6. Usage in Frontend

The image upload component is integrated into the product form:

```tsx
<ImageUpload
  onImageUpload={(imageData) => {
    // Handle image upload success
    field.onChange(imageData)
  }}
  onImageRemove={() => {
    // Handle image removal
    field.onChange(undefined)
  }}
  currentImageUrl={field.value?.url}
/>
```

### 7. Error Handling

The system handles various error scenarios:
- Network connectivity issues
- File size/type validation
- Cloudinary service errors
- Authentication errors

### 8. Best Practices

1. **Image Optimization**: Cloudinary automatically optimizes images
2. **CDN Delivery**: Images are served via Cloudinary's global CDN
3. **Transformations**: You can apply real-time transformations to images
4. **Backup**: Cloudinary provides reliable cloud storage
5. **Bandwidth**: Free tier includes 25GB/month bandwidth

### 9. Cloudinary Free Tier Limits

- 25,000 total images and videos
- 25 GB storage
- 25 GB monthly bandwidth
- Basic transformations included

### 10. Production Considerations

1. Set up proper environment variables in production
2. Consider upgrading Cloudinary plan for higher usage
3. Implement additional image validation if needed
4. Monitor Cloudinary usage in your dashboard
5. Set up webhook notifications for quota limits

## Troubleshooting

### Common Issues:

1. **"Upload failed" error**: Check Cloudinary credentials in .env file
2. **File too large**: Default limit is 5MB, increase if needed
3. **Invalid file type**: Only image files are accepted
4. **CORS errors**: Ensure proper server configuration

### Testing:

1. Test with different image formats (JPG, PNG, GIF, WebP)
2. Test file size limits
3. Test image deletion
4. Test product updates with new images
5. Test error scenarios (network offline, invalid credentials)

## Support

If you encounter issues:
1. Check server logs for detailed error messages
2. Verify Cloudinary credentials
3. Test API endpoints directly
4. Check network connectivity
5. Review Cloudinary dashboard for usage and errors
