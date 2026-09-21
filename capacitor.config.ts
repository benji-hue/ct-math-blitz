import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'by.ctmath.blitz',
  appName: 'ЦТ Математика',
  webDir: 'dist',
  backgroundColor: '#070b18',
  ios: {
    // Full-bleed web view: safe areas are handled in CSS via env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#070b18',
    scrollEnabled: true,
  },
}

export default config
