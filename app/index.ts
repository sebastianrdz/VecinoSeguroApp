import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// It also ensures the environment is set up appropriately whether the app
// loads in Expo Go or in a custom dev client / production build.
registerRootComponent(App);
