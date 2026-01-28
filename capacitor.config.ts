import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jukboks.app',
  appName: 'Jukboks',
  webDir: 'dist/public',
  ios: {
    scheme: 'Jukboks',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0f0a1e'
  },
  server: {
    hostname: 'jukboks.app',
    iosScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f0a1e',
      showSpinner: false
    }
  }
};

export default config;
