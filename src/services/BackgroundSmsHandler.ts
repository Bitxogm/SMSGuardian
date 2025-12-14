
import { SMSAnalysisService } from './SMSAnalysisService';
import { databaseService } from './DatabaseService';
import { NativeModules, Platform, DeviceEventEmitter } from 'react-native';

const { SMSModule } = NativeModules;

export const backgroundSmsHandler = async (taskData: any) => {
  console.log('started background SMS task', taskData);
  const { phoneNumber, messageBody, timestamp } = taskData;
  const msgTimestamp = timestamp || Date.now();

  if (!phoneNumber || !messageBody) {
    console.warn('Background SMS Task missing data:', taskData);
    return;
  }

  try {
    // Ensure database is initialized
    await databaseService.initialize();

    console.log('Analyzing SMS in background...');
    const analysis = await SMSAnalysisService.analyzeSMS(phoneNumber, messageBody);

    // Log analysis (Quarantine or Block logic)
    await SMSAnalysisService.logAnalysis(analysis, {
      phoneNumber,
      messageContent: messageBody,
      timestamp: msgTimestamp
    });

    if (analysis.shouldQuarantine) {
      console.log('⚠️ SMS Quarantined (Background):', analysis.reason);
    } else {
      console.log('✅ SMS Allowed (Background)');

      // 1. Save to System Inbox (so it is not lost)
      if (Platform.OS === 'android') {
        await SMSModule.saveSmsToInbox(phoneNumber, messageBody, msgTimestamp);
        SMSModule.showNotification(phoneNumber, messageBody);
      }

      // 2. Save to App Inbox (DB)
      await databaseService.logInbox({
        phoneNumber: phoneNumber,
        messageContent: messageBody,
        timestamp: msgTimestamp
      });

      // 3. Notify UI (if app is running)
      DeviceEventEmitter.emit('STATS_UPDATED');
    }

    console.log('Background SMS processing complete');
  } catch (error) {
    console.error('Error in background SMS task:', error);
  }
};
