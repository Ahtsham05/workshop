// Backup simple image display component for testing
export function SimpleImageDisplay({ imageUrl }: { imageUrl: string }) {
  return (
    <div style={{ 
      border: '2px solid #e5e7eb', 
      borderRadius: '8px', 
      padding: '16px',
      backgroundColor: '#f9fafb'
    }}>
      <p style={{ fontSize: '12px', marginBottom: '8px' }}>Simple Image Test:</p>
      <img 
        src={imageUrl}
        alt="Simple test"
        style={{
          width: '100%',
          height: '192px',
          objectFit: 'cover',
          borderRadius: '8px',
          backgroundColor: '#ffffff',
          border: '1px solid #d1d5db'
        }}
        onLoad={() => console.log('Simple image loaded:', imageUrl)}
        onError={(e) => console.error('Simple image failed:', imageUrl, e)}
      />
      <p style={{ fontSize: '10px', marginTop: '8px', color: '#6b7280', wordBreak: 'break-all' }}>
        {imageUrl}
      </p>
    </div>
  )
}
