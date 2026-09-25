import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Ignorera gula varningsrutor i utvecklingsläge så att UI visas direkt utan overlay
LogBox.ignoreAllLogs(true);

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
