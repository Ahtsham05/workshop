// Simple test component to verify Cloudinary images
import React from 'react'

export default function ImageTest() {
  const testUrl = "https://res.cloudinary.com/da2kbpyuu/image/upload/v1755587937/products/product_temp_1755587922415.png"
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>Image Test</h3>
      <p>Testing Cloudinary URL:</p>
      <p style={{ fontSize: '12px', wordBreak: 'break-all' }}>{testUrl}</p>
      <img 
        src={testUrl} 
        alt="Test" 
        style={{ 
          width: '200px', 
          height: '200px', 
          objectFit: 'cover',
          border: '1px solid #ccc',
          backgroundColor: '#f0f0f0'
        }}
        onLoad={() => console.log('Test image loaded successfully')}
        onError={(e) => console.error('Test image failed to load', e)}
      />
    </div>
  )
}
