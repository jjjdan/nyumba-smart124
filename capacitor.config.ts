import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nyumbasmart.app',
  appName: 'Nyumba Smart',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
