import { useCallback, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { Camera, Loader2, Upload } from 'lucide-react'
import CameraCapture from '@/components/camera-capture'
import { UserAvatar } from '@/components/user-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { setUserPhoto } from '@/stores/auth.slice'
import { useDeleteMyPhotoMutation, userPreferencesApi } from '@/stores/user-preferences.api'
import type { AppDispatch, RootState } from '@/stores/store'

interface ProfilePhotoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Solid, no-gradient tones — each becomes the background of a generated avatar. */
const AVATAR_PRESETS = [
  { name: 'Sky', color: '#0EA5E9' },
  { name: 'Emerald', color: '#10B981' },
  { name: 'Amber', color: '#F59E0B' },
  { name: 'Violet', color: '#8B5CF6' },
  { name: 'Rose', color: '#F43F5E' },
  { name: 'Teal', color: '#14B8A6' },
  { name: 'Indigo', color: '#6366F1' },
  { name: 'Orange', color: '#F97316' },
  { name: 'Slate', color: '#64748B' },
  { name: 'Pink', color: '#EC4899' },
]

/**
 * Draws a flat, generic person silhouette on a solid-colour circle — a ready-made
 * avatar for anyone who'd rather not upload a photo. Rendered on a canvas and sent
 * through the same upload endpoint as a real photo, so once picked it behaves
 * identically everywhere (header, sidebar, print) — no special-casing needed.
 */
function renderPresetAvatar(color: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas not supported'))
      return
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.arc(size / 2, size * 0.4, size * 0.17, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(size * 0.15, size * 0.92)
    ctx.quadraticCurveTo(size * 0.15, size * 0.62, size * 0.5, size * 0.62)
    ctx.quadraticCurveTo(size * 0.85, size * 0.62, size * 0.85, size * 0.92)
    ctx.closePath()
    ctx.fill()
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render avatar'))
    }, 'image/png')
  })
}

/** Change or remove the signed-in user's photo — upload, take a photo, or pick a
 *  preset avatar, all of which replace whatever's there directly (the backend
 *  already swaps and cleans up the previous image on every new upload). */
export function ProfilePhotoDialog({ open, onOpenChange }: ProfilePhotoDialogProps) {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const [deletePhoto, { isLoading: isRemoving }] = useDeleteMyPhotoMutation()
  const [uploading, setUploading] = useState(false)
  const [pendingColor, setPendingColor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const photoUrl: string = user?.photo?.url ?? ''
  const busy = uploading || isRemoving

  const applyUploaded = (image: { url: string; publicId: string }) => {
    dispatch(setUserPhoto(image))
    dispatch(
      userPreferencesApi.util.updateQueryData('getMyProfile', undefined, (draft) => {
        draft.photo = image
      }),
    )
  }

  const uploadFile = useCallback(async (file: File | Blob, name: string) => {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('image', file, name)

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/users/me/photo`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })

      if (!response.ok) throw new Error('Upload failed')
      const result = await response.json()
      if (!result?.url) throw new Error('Invalid response format')

      applyUploaded(result)
      toast.success('Profile photo updated')
    } catch {
      setError('Could not upload the photo. Please try again.')
      toast.error('Could not upload the photo. Please try again.')
    } finally {
      setUploading(false)
      setPendingColor(null)
    }
  }, [])

  const handlePresetSelect = async (color: string) => {
    if (busy) return
    setPendingColor(color)
    try {
      const blob = await renderPresetAvatar(color)
      await uploadFile(blob, 'avatar.png')
    } catch {
      setPendingColor(null)
      setError('Could not generate that avatar. Please try again.')
    }
  }

  const handleCameraCapture = async (file: File) => {
    await uploadFile(file, file.name)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) await uploadFile(file, file.name)
    if (event.target) event.target.value = ''
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) await uploadFile(file, file.name)
    },
    [uploadFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    disabled: busy,
    noClick: true,
    noKeyboard: true,
  })

  const handleRemove = async () => {
    try {
      await deletePhoto().unwrap()
      dispatch(setUserPhoto({ url: '', publicId: '' }))
      dispatch(
        userPreferencesApi.util.updateQueryData('getMyProfile', undefined, (draft) => {
          draft.photo = { url: '', publicId: '' }
        }),
      )
      toast.success('Profile photo removed')
    } catch {
      toast.error('Could not remove the photo. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Profile photo</DialogTitle>
          <DialogDescription>
            Your photo appears in the header, the sidebar and anywhere your account is shown.
          </DialogDescription>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-5 text-center transition-colors',
            isDragActive ? 'border-primary bg-primary/[0.06]' : 'border-muted-foreground/25',
          )}
        >
          <input {...getInputProps()} />

          <div className='relative'>
            <UserAvatar
              name={user?.name}
              email={user?.email}
              photoUrl={photoUrl}
              className='h-20 w-20'
              fallbackClassName='text-xl'
            />
            {uploading && !pendingColor ? (
              <div className='absolute inset-0 flex items-center justify-center rounded-full bg-black/40'>
                <Loader2 className='h-5 w-5 animate-spin text-white' />
              </div>
            ) : null}
          </div>

          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>{user?.name}</p>
            <p className='text-muted-foreground truncate text-xs'>{user?.email}</p>
          </div>

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            onChange={handleFileChange}
            className='hidden'
          />
          <div className='flex w-full gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='flex-1'
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className='mr-2 h-4 w-4' />
              Upload photo
            </Button>
            <CameraCapture
              onCapture={handleCameraCapture}
              disabled={busy}
              trigger={
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='flex-1'
                  disabled={busy}
                >
                  <Camera className='mr-2 h-4 w-4' />
                  Take photo
                </Button>
              }
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            Drag & drop an image here, or PNG/JPG up to 5MB
          </p>
        </div>

        <div>
          <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase'>
            Or choose an avatar
          </p>
          <div className='grid grid-cols-5 gap-2'>
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.color}
                type='button'
                disabled={busy}
                onClick={() => void handlePresetSelect(preset.color)}
                title={`${preset.name} avatar`}
                aria-label={`Use the ${preset.name} avatar`}
                className='relative flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
                style={{ backgroundColor: preset.color }}
              >
                {pendingColor === preset.color ? (
                  <Loader2 className='h-4 w-4 animate-spin text-white' />
                ) : (
                  <svg viewBox='0 0 24 24' className='h-5 w-5' fill='rgba(255,255,255,0.95)' aria-hidden>
                    <circle cx='12' cy='9' r='3.6' />
                    <path d='M4.5 20c.7-4.4 3.7-6.8 7.5-6.8s6.8 2.4 7.5 6.8Z' />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className='text-destructive text-center text-sm'>{error}</p> : null}

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            type='button'
            variant='ghost'
            onClick={handleRemove}
            disabled={!photoUrl || busy}
          >
            {isRemoving ? 'Removing…' : 'Remove photo'}
          </Button>
          <Button type='button' onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
