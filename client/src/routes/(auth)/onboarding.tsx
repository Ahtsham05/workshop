import { createFileRoute } from '@tanstack/react-router'
import OnboardingPage from '@/features/onboarding'

export const Route = createFileRoute('/(auth)/onboarding')({
  component: OnboardingPage,
})
