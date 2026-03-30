import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import toast from 'react-hot-toast';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Don't show anything if app is already installed
  if (isInstalled || !isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    try {
      await install();
      toast.success('App installed! You can now access it from your home screen.');
    } catch (error) {
      toast.error('Installation failed. Try again or use "Add to home screen".');
    }
  };

  return (
    <Button
      onClick={handleInstall}
      variant='outline'
      size='sm'
      className='gap-2 text-blue-600 border-blue-300 hover:bg-blue-50'
      title='Install Logix Plus Solutions on your device'
    >
      <Download className='h-4 w-4' />
      <span className='hidden sm:inline'>Install App</span>
    </Button>
  );
}
