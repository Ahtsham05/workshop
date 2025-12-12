import { createFileRoute } from '@tanstack/react-router';
import { useLanguage } from '@/context/language-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings, Users, Calendar, FileText, DollarSign, Shield } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/hr/settings/')({
  component: HRSettings,
});

function HRSettings() {
  const { t } = useLanguage();

  const settingsSections = [
    {
      title: t('Designation Management'),
      description: t('Manage job titles and positions'),
      icon: <Users className="h-6 w-6 text-blue-600" />,
      color: 'bg-blue-50',
    },
    {
      title: t('Shift Management'),
      description: t('Configure work shifts and timings'),
      icon: <Calendar className="h-6 w-6 text-green-600" />,
      color: 'bg-green-50',
    },
    {
      title: t('Leave Types'),
      description: t('Configure leave types and policies'),
      icon: <FileText className="h-6 w-6 text-orange-600" />,
      color: 'bg-orange-50',
    },
    {
      title: t('Payroll Settings'),
      description: t('Configure salary components and tax settings'),
      icon: <DollarSign className="h-6 w-6 text-purple-600" />,
      color: 'bg-purple-50',
    },
    {
      title: t('Permissions'),
      description: t('Manage HR module permissions'),
      icon: <Shield className="h-6 w-6 text-red-600" />,
      color: 'bg-red-50',
    },
    {
      title: t('General Settings'),
      description: t('Configure general HR settings'),
      icon: <Settings className="h-6 w-6 text-gray-600" />,
      color: 'bg-gray-50',
    },
  ];

  return (
    <div className="h-full w-full p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('HR Settings')}</h1>
        <p className="text-muted-foreground mt-2">{t('Configure HR system settings and preferences')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsSections.map((section, index) => (
          <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className={`p-3 rounded-full ${section.color} w-fit mb-2`}>
                {section.icon}
              </div>
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('Settings Configuration')}</h3>
          <p className="text-muted-foreground">
            {t('These settings panels can be implemented based on your specific requirements.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

