import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  setManualKeyboardLanguage, 
  getManualKeyboardLanguage,
  detectCurrentKeyboardLanguage 
} from '@/utils/keyboard-language-utils'

export function KeyboardLanguageOverride() {
  const [currentOverride, setCurrentOverride] = React.useState<'ur' | 'en' | null>(getManualKeyboardLanguage())
  const [detectedLanguage, setDetectedLanguage] = React.useState<'ur' | 'en'>(detectCurrentKeyboardLanguage())

  const handleSetLanguage = (language: 'ur' | 'en' | null) => {
    setManualKeyboardLanguage(language)
    setCurrentOverride(language)
  }

  const refreshDetection = () => {
    setDetectedLanguage(detectCurrentKeyboardLanguage())
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-sm">Keyboard Language Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Auto-detected:</span>
            <Badge variant="outline" className="text-xs">
              {detectedLanguage === 'ur' ? 'اردو (ur)' : 'English (en)'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current override:</span>
            <Badge variant={currentOverride ? 'default' : 'secondary'} className="text-xs">
              {currentOverride === 'ur' ? 'اردو (ur)' : 
               currentOverride === 'en' ? 'English (en)' : 
               'Auto-detect'}
            </Badge>
          </div>
        </div>

        {/* Manual Override Buttons */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Manual Override:</div>
          <div className="flex gap-2">
            <Button
              variant={currentOverride === 'ur' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSetLanguage('ur')}
              className="flex-1"
            >
              اردو (ur)
            </Button>
            <Button
              variant={currentOverride === 'en' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSetLanguage('en')}
              className="flex-1"
            >
              English (en)
            </Button>
          </div>
          <Button
            variant={currentOverride === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSetLanguage(null)}
            className="w-full"
          >
            Auto-detect
          </Button>
        </div>

        {/* Refresh Detection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshDetection}
          className="w-full text-xs"
        >
          Refresh Detection
        </Button>
      </CardContent>
    </Card>
  )
}
