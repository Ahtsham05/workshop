import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { useChangePasswordMutation } from '@/stores/company.api'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useDispatch } from 'react-redux'
import { useNavigate } from '@tanstack/react-router'
import { logout } from '@/stores/auth.slice'
import { AppDispatch } from '@/stores/store'

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const [changePassword, { isLoading }] = useChangePasswordMutation()
  
  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const togglePasswordVisibility = (field: 'old' | 'new' | 'confirm') => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error(t('Passwords do not match'))
      return
    }

    if (formData.newPassword.length < 8) {
      toast.error(t('Password must be at least 8 characters'))
      return
    }

    try {
      await changePassword({
        oldPassword: formData.oldPassword,
        newPassword: formData.newPassword,
      }).unwrap()
      
      toast.success(t('Password changed successfully'))
      setFormData({ oldPassword: '', newPassword: '', confirmPassword: '' })
      onOpenChange(false)
      
      // Logout user automatically for security
      const refreshToken = localStorage.getItem('refreshToken')
      await dispatch(logout({ refreshToken }))
      
      // Redirect to login page with message
      setTimeout(() => {
        toast.info(t('Please login with your new password'))
        navigate({ to: '/sign-in', search: { redirect: '/' }, replace: true })
      }, 1000)
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to change password'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Lock className='h-5 w-5' />
              {t('change_password')}
            </DialogTitle>
            <DialogDescription>{t('change_your_company_password')}</DialogDescription>
          </DialogHeader>
          
          <div className='space-y-4 py-4'>
            {/* Old Password */}
            <div className='space-y-2'>
              <Label htmlFor='oldPassword'>{t('current_password')}</Label>
              <div className='relative'>
                <Input
                  id='oldPassword'
                  type={showPasswords.old ? 'text' : 'password'}
                  value={formData.oldPassword}
                  onChange={(e) => handleInputChange('oldPassword', e.target.value)}
                  required
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                  onClick={() => togglePasswordVisibility('old')}
                >
                  {showPasswords.old ? (
                    <EyeOff className='h-4 w-4' />
                  ) : (
                    <Eye className='h-4 w-4' />
                  )}
                </Button>
              </div>
            </div>

            {/* New Password */}
            <div className='space-y-2'>
              <Label htmlFor='newPassword'>{t('new_password')}</Label>
              <div className='relative'>
                <Input
                  id='newPassword'
                  type={showPasswords.new ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={(e) => handleInputChange('newPassword', e.target.value)}
                  required
                  minLength={8}
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                  onClick={() => togglePasswordVisibility('new')}
                >
                  {showPasswords.new ? (
                    <EyeOff className='h-4 w-4' />
                  ) : (
                    <Eye className='h-4 w-4' />
                  )}
                </Button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className='space-y-2'>
              <Label htmlFor='confirmPassword'>{t('confirm_new_password')}</Label>
              <div className='relative'>
                <Input
                  id='confirmPassword'
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  required
                  minLength={8}
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                  onClick={() => togglePasswordVisibility('confirm')}
                >
                  {showPasswords.confirm ? (
                    <EyeOff className='h-4 w-4' />
                  ) : (
                    <Eye className='h-4 w-4' />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type='submit' disabled={isLoading}>
              {isLoading ? t('changing') : t('change_password')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
