import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-context'
import { useGetCompanyQuery, useUpdateCompanyMutation, useCreateCompanyMutation } from '@/stores/company.api'
import { toast } from 'sonner'
import { Building2, Mail, Phone, MapPin, FileText, Save, Lock, Eye, EyeOff } from 'lucide-react'
import { ChangePasswordDialog } from '@/features/company/change-password-dialog'

export default function CompanyProfilePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const { data: company, isLoading } = useGetCompanyQuery()
  const [updateCompany, { isLoading: isUpdating }] = useUpdateCompanyMutation()
  const [createCompany, { isLoading: isCreating }] = useCreateCompanyMutation()
  
  // Keep navigate ref updated
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    taxNumber: '',
  })

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isCreatingNew = company === null

  // Initialize form data when company data is loaded
  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || '',
        email: company.email || '',
        password: '', // Password field for creating new company
        phone: company.phone || '',
        address: company.address || '',
        city: company.city || '',
        country: company.country || '',
        taxNumber: company.taxNumber || '',
      })
    }
  }, [company])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (isCreatingNew) {
        // Creating new company - password is required
        if (!formData.password || formData.password.length < 8) {
          toast.error(t('Password must be at least 8 characters'))
          return
        }
        await createCompany(formData).unwrap()
        toast.success(t('Company profile created successfully'))
      } else {
        // Updating existing company - remove password field
        const { password, ...updateData } = formData
        await updateCompany(updateData).unwrap()
        toast.success(t('Company profile updated successfully'))
      }
    } catch (error: any) {
      toast.error(error?.data?.message || t(isCreatingNew ? 'Failed to create company profile' : 'Failed to update company profile'))
    }
  }

  if (isLoading) {
    return (
      <div className='space-y-6 p-6'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-[600px] w-full' />
      </div>
    )
  }

  // Don't render if no company (will redirect)
//   if (!company) {
//     return null
//   }

  return (
    <div className='space-y-6 p-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            {isCreatingNew ? t('company_setup') : t('company_profile')}
          </h1>
          <p className='text-muted-foreground'>
            {isCreatingNew ? t('setup_your_company_profile') : t('manage_your_company_information')}
          </p>
        </div>
        {!isCreatingNew && (
          <Button variant='outline' onClick={() => setIsPasswordDialogOpen(true)}>
            {t('change_password')}
          </Button>
        )}
      </div>

      {/* Company Profile Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>{t('company_information')}</CardTitle>
            <CardDescription>{t('update_your_company_details')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            {/* Basic Information */}
            <div className='grid gap-6 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='name'>
                  <Building2 className='inline h-4 w-4 mr-2' />
                  {t('company_name')} *
                </Label>
                <Input
                  id='name'
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='email'>
                  <Mail className='inline h-4 w-4 mr-2' />
                  {t('email')} *
                </Label>
                <Input
                  id='email'
                  type='email'
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>

              {isCreatingNew && (
                <div className='space-y-2'>
                  <Label htmlFor='password'>
                    <Lock className='inline h-4 w-4 mr-2' />
                    {t('password')} *
                  </Label>
                  <div className='relative'>
                    <Input
                      id='password'
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder={t('enter_password')}
                      required
                      minLength={8}
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                    </Button>
                  </div>
                </div>
              )}

              <div className='space-y-2'>
                <Label htmlFor='phone'>
                  <Phone className='inline h-4 w-4 mr-2' />
                  {t('phone')}
                </Label>
                <Input
                  id='phone'
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='taxNumber'>
                  <FileText className='inline h-4 w-4 mr-2' />
                  {t('tax_number')}
                </Label>
                <Input
                  id='taxNumber'
                  value={formData.taxNumber}
                  onChange={(e) => handleInputChange('taxNumber', e.target.value)}
                />
              </div>
            </div>

            {/* Address Information */}
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold flex items-center'>
                <MapPin className='h-5 w-5 mr-2' />
                {t('address_information')}
              </h3>
              
              <div className='space-y-2'>
                <Label htmlFor='address'>{t('address')}</Label>
                <Textarea
                  id='address'
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={3}
                />
              </div>

              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='city'>{t('city')}</Label>
                  <Input
                    id='city'
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='country'>{t('country')}</Label>
                  <Input
                    id='country'
                    value={formData.country}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className='flex justify-end gap-4 pt-4'>
              <Button type='button' variant='outline' onClick={() => navigate({ to: '/' })}>
                {t('cancel')}
              </Button>
              <Button type='submit' disabled={isUpdating || isCreating}>
                <Save className='mr-2 h-4 w-4' />
                {isCreating ? t('creating') : isUpdating ? t('saving') : isCreatingNew ? t('create_company_profile') : t('save_changes')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Change Password Dialog */}
      <ChangePasswordDialog 
        open={isPasswordDialogOpen} 
        onOpenChange={setIsPasswordDialogOpen} 
      />
    </div>
  )
}
