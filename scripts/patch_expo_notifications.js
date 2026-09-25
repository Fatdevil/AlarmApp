const fs = require('fs');
const path = require('path');

console.log('[Patch] Running expo-notifications Expo Go Android patches...');

// 1. Patch warnOfExpoGoPushUsage so it logs instead of throwing Error or showing yellow warning banner on Android
const warnFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'warnOfExpoGoPushUsage.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src', 'warnOfExpoGoPushUsage.ts'),
];

warnFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(
      /if\s*\(\s*Platform\.OS\s*===\s*'android'\s*\)\s*\{\s*throw new Error\(message\);\s*\}\s*else\s*if\s*\(__DEV__\)\s*\{\s*didWarn\s*=\s*true;\s*console\.warn\(message\);\s*\}/g,
      'didWarn = true; console.log(message);'
    );
    content = content.replace(/console\.warn\(message\);/g, 'console.log(message);');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`[Patch] Successfully patched ${path.basename(file)}.`);
  }
});

// 2. Patch top-level index.js warning in expo-notifications
const indexFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'index.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src', 'index.ts'),
];

indexFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/console\.warn\(message\);/g, 'console.log(message);');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`[Patch] Successfully patched ${path.basename(file)}.`);
  }
});

// 3. Patch TopicSubscriptionModule.android.js to use requireOptionalNativeModule and fallback
const topicModuleBuild = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'TopicSubscriptionModule.android.js');
if (fs.existsSync(topicModuleBuild)) {
  const topicBuildContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
const nativeModule = requireOptionalNativeModule('ExpoTopicSubscriptionModule');
const fallback = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
export default nativeModule ?? fallback;
`;
  fs.writeFileSync(topicModuleBuild, topicBuildContent, 'utf8');
  console.log('[Patch] Successfully patched TopicSubscriptionModule.android.js to use optional module fallback.');
}

const topicModuleSrc = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src', 'TopicSubscriptionModule.android.ts');
if (fs.existsSync(topicModuleSrc)) {
  const topicSrcContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
import type { TopicSubscriptionModule } from './TopicSubscriptionModule.types';
const nativeModule = requireOptionalNativeModule<TopicSubscriptionModule>('ExpoTopicSubscriptionModule');
const fallback: Required<TopicSubscriptionModule> = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
export default (nativeModule ?? fallback) as TopicSubscriptionModule;
`;
  fs.writeFileSync(topicModuleSrc, topicSrcContent, 'utf8');
  console.log('[Patch] Successfully patched TopicSubscriptionModule.android.ts to use optional module fallback.');
}

// 4. Patch PushTokenManager.native.js to use requireOptionalNativeModule
const pushTokenBuild = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'PushTokenManager.native.js');
if (fs.existsSync(pushTokenBuild)) {
  const pushContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
import defaultFallback from './PushTokenManager';
const nativeModule = requireOptionalNativeModule('ExpoPushTokenManager');
export default nativeModule ?? defaultFallback;
`;
  fs.writeFileSync(pushTokenBuild, pushContent, 'utf8');
  console.log('[Patch] Successfully patched PushTokenManager.native.js to use optional module fallback.');
}

// 5. Patch ServerRegistrationModule.native.js to use requireOptionalNativeModule
const serverRegBuild = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'ServerRegistrationModule.native.js');
if (fs.existsSync(serverRegBuild)) {
  const serverRegContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
import defaultFallback from './ServerRegistrationModule';
const nativeModule = requireOptionalNativeModule('NotificationsServerRegistrationModule');
export default nativeModule ?? defaultFallback;
`;
  fs.writeFileSync(serverRegBuild, serverRegContent, 'utf8');
  console.log('[Patch] Successfully patched ServerRegistrationModule.native.js to use optional module fallback.');
}

console.log('[Patch] All expo-notifications patches applied successfully.');
