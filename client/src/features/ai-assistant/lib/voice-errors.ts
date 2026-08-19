import type { VoiceModeError } from '../hooks/use-voice-mode'

export const VOICE_ERROR_MESSAGES: Record<VoiceModeError, string> = {
  'permission-denied':
    'Microphone access is blocked. Allow it for this site in your browser’s address-bar permissions, then try again.',
  'mic-unavailable': 'No microphone was found. Please check your device and try again.',
  'no-speech': "Didn't catch that — please try again.",
  'recognition-error': 'Voice recognition had a problem. Please try again.',
  'start-failed': 'Could not start recording. Please try again.',
}
