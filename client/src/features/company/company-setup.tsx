import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { useCreateCompanyMutation } from '@/stores/company.api'
import { toast } from 'sonner'
import { Building2, Mail, Phone, MapPin, FileText, Lock, Eye, EyeOff } from 'lucide-react'

export default function CompanySetupPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [createCompany, { isLoading }] = useCreateCompanyMutation()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    taxNumber: '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      toast.error(t('Passwords do not match'))
      return
    }

    if (formData.password.length < 8) {
      toast.error(t('Password must be at least 8 characters'))
      return
    }

    try {
      const { confirmPassword, ...submitData } = formData
      await createCompany(submitData).unwrap()
      toast.success(t('Company profile created successfully'))
      navigate({ to: '/company' })
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to create company profile'))
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center p-6 bg-muted/40'>
      <div className='w-full max-w-4xl'>
        {/* Header */}
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold tracking-tight'>{t('company_setup')}</h1>
          <p className='text-muted-foreground mt-2'>{t('setup_your_company_profile')}</p>
        </div>

        {/* Setup Form */}
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>{t('company_information')}</CardTitle>
              <CardDescription>{t('enter_your_company_details_to_get_started')}</CardDescription>
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
                    placeholder={t('enter_company_name')}
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
                    placeholder={t('enter_email')}
                    required
                  />
                </div>

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

                <div className='space-y-2'>
                  <Label htmlFor='confirmPassword'>
                    <Lock className='inline h-4 w-4 mr-2' />
                    {t('confirm_password')} *
                  </Label>
                  <div className='relative'>
                    <Input
                      id='confirmPassword'
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      placeholder={t('confirm_password')}
                      required
                      minLength={8}
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                    </Button>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='phone'>
                    <Phone className='inline h-4 w-4 mr-2' />
                    {t('phone')}
                  </Label>
                  <Input
                    id='phone'
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder={t('enter_phone')}
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
                    placeholder={t('enter_tax_number')}
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
                    placeholder={t('enter_address')}
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
                      placeholder={t('enter_city')}
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='country'>{t('country')}</Label>
                    <Input
                      id='country'
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      placeholder={t('enter_country')}
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className='flex justify-end pt-4'>
                <Button type='submit' disabled={isLoading} size='lg'>
                  {isLoading ? t('creating') : t('create_company_profile')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
