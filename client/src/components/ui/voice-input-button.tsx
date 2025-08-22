import React from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  className = '',
  size = 'sm',
}) => {
  const { t } = useLanguage();

  const { isListening, isSupported, startListening, stopListening } = useVoiceInput({
    onResult: (transcript) => {
      console.log('Voice input received:', transcript);
      onTranscript(transcript);
      toast.success(`${t('voice_recording_stopped')}: "${transcript}"`);
    },
    onError: (error) => {
      console.error('Voice input error:', error);
      toast.error(error);
    },
  });

  if (!isSupported) {
    return (
      <div className="w-6 h-6 flex items-center justify-center text-gray-400" title={t('voice_recognition_not_supported')}>
        <Mic className="w-3 h-3 opacity-50" />
      </div>
    );
  }

  const handleClick = () => {
    console.log('Voice button clicked, isListening:', isListening);
    
    if (isListening) {
      console.log('Stopping voice recording...');
      stopListening();
    } else {
      console.log('Starting voice recording...');
      toast.success(t('voice_recording_started'));
      startListening();
    }
  };

  const getButtonSize = () => {
    switch (size) {
      case 'sm':
        return 'w-6 h-6';
      case 'md':
        return 'w-8 h-8';
      case 'lg':
        return 'w-10 h-10';
      default:
        return 'w-6 h-6';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm':
        return 'w-3 h-3';
      case 'md':
        return 'w-4 h-4';
      case 'lg':
        return 'w-5 h-5';
      default:
        return 'w-3 h-3';
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      className={`${getButtonSize()} flex items-center justify-center shrink-0 ${
        isListening 
          ? 'bg-red-100 border-red-300 hover:bg-red-200 text-red-600 animate-pulse' 
          : 'hover:bg-gray-100'
      } ${className}`}
      style={{ height: '24px', width: '24px', minHeight: '24px', minWidth: '24px' }}
      title={isListening ? t('stop_voice_recording') : t('start_voice_recording')}
    >
      {isListening ? (
        <div className="flex items-center justify-center w-full h-full">
          <Loader2 className={`${getIconSize()} animate-spin`} />
        </div>
      ) : (
        <div className="flex items-center justify-center w-full h-full">
          <Mic className={getIconSize()} />
        </div>
      )}
    </Button>
  );
};
