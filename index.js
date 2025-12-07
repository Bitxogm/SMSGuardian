/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';


import { backgroundSmsHandler } from './src/services/BackgroundSmsHandler';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('SMSBackgroundService', () => backgroundSmsHandler);

