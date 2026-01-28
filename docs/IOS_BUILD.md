# Jukboks iOS App Build Guide

This guide explains how to build and submit the Jukboks iOS app to the App Store.

## Prerequisites

1. **Mac with Xcode 15+** installed
2. **Apple Developer Account** ($99/year)
3. **CocoaPods** installed: `sudo gem install cocoapods`
4. **Node.js 18+** installed

## Project Structure

```
ios/
├── App/
│   ├── App/
│   │   ├── Assets.xcassets/    # App icons and images
│   │   ├── Info.plist          # App configuration
│   │   └── public/             # Web assets (synced from dist/public)
│   ├── App.xcodeproj/          # Xcode project
│   └── Podfile                 # CocoaPods dependencies
```

## Build Steps

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd jukboks
npm install
```

### 2. Build Web Assets and Sync to iOS

```bash
npm run cap:sync
```

This builds the web app and copies it to the iOS project.

### 3. Install iOS Dependencies

```bash
cd ios/App
pod install
cd ../..
```

### 4. Open in Xcode

```bash
npm run cap:open
# Or manually: open ios/App/App.xcworkspace
```

**Important:** Always open the `.xcworkspace` file, not `.xcodeproj`.

### 5. Configure Signing

1. In Xcode, select the **App** target
2. Go to **Signing & Capabilities**
3. Select your **Team** (Apple Developer account)
4. Xcode will automatically create provisioning profiles

### 6. Add App Icons

Replace the placeholder icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`:

| Size | Filename | Usage |
|------|----------|-------|
| 1024x1024 | AppIcon-1024.png | App Store |
| 180x180 | AppIcon-180.png | iPhone @3x |
| 120x120 | AppIcon-120.png | iPhone @2x |
| 167x167 | AppIcon-167.png | iPad Pro |
| 152x152 | AppIcon-152.png | iPad @2x |
| 76x76 | AppIcon-76.png | iPad @1x |

### 7. Configure API URL

The app connects to your deployed Jukboks backend. Make sure your backend is deployed and accessible.

In `capacitor.config.ts`, the server hostname is set to `jukboks.app`. Update this to match your actual domain.

### 8. Build and Run

1. Select a simulator or connected device
2. Click **Run** (▶) or press `Cmd + R`

### 9. Submit to App Store

1. In Xcode, go to **Product > Archive**
2. Once archived, click **Distribute App**
3. Choose **App Store Connect**
4. Follow the prompts to upload

## App Store Requirements

Before submitting, ensure you have:

- [ ] App icons for all required sizes
- [ ] Screenshots for iPhone and iPad
- [ ] App description and keywords
- [ ] Privacy policy URL
- [ ] Support URL

## Updating the App

When you make changes to the web app:

```bash
npm run cap:sync
```

Then rebuild in Xcode.

## Troubleshooting

### "No signing certificate" error
- Ensure you're signed into your Apple Developer account in Xcode preferences

### White screen on launch
- Check the Xcode console for JavaScript errors
- Ensure `npm run cap:sync` completed successfully

### API calls failing
- Verify your backend URL is correct
- Check that CORS allows your app's requests

## App Features

The iOS app provides:

- **Guest Mode**: Scan QR code or enter venue code to request songs
- **Admin Mode**: Sign in to manage venues and view kiosk
- Full Apple Music integration via MusicKit
- Offline queue caching (coming soon)
