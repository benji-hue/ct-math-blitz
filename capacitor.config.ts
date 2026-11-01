import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'by.ctmath.blitz',
  appName: 'Krok',
  webDir: 'dist',
  backgroundColor: '#05060b',
  ios: {
    // Full-bleed web view: safe areas are handled in CSS via env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#05060b',
    scrollEnabled: true,
  },
}

export default config
