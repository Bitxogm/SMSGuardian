import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { SMSAnalysisService } from './SMSAnalysisService';
import { PermissionsService } from './PermissionsService';
import { databaseService } from './DatabaseService';

const { SMSModule } = NativeModules;

export class SMSInterceptorService {
  private static listener: any = null;

  static async initialize(): Promise<void> {
    console.log('🔧 SMS Interceptor initializing...');
    try {
      console.log('Initializing SMS Interceptor...');
      const hasPermissions = await PermissionsService.checkSMSPermissions();
      if (!hasPermissions) {
        console.log('SMS permissions not granted, requesting...');
        const granted = await PermissionsService.requestSMSPermissions();
        if (!granted) {
          console.log('SMS permissions denied');
          return;
        }
      }
      console.log('Setting up SMS_RECEIVED listener...');

      this.listener = DeviceEventEmitter.addListener('SMS_RECEIVED', this.handleSMSReceived);
      console.log('✅ SMS Interceptor initialized - listening for SMS_RECEIVED');

      // Create notification channel on init
      if (Platform.OS === 'android') {
        SMSModule.createNotificationChannel();
      }

    } catch (error) {
      console.error('Error initializing SMS interceptor:', error);
    }
  }

  private static handleSMSReceived = async (smsData: any) => {
    console.log('🚀 SMS_RECEIVED event caught!');
    console.log('📱 Phone:', smsData.phoneNumber);
    console.log('💬 Message:', smsData.messageBody);

    try {
      const analysis = await SMSAnalysisService.analyzeSMS(smsData.phoneNumber, smsData.messageBody);
      console.log('🔍 Analysis result:', JSON.stringify(analysis, null, 2));

      if (analysis.shouldQuarantine) {
        console.log('⚠️ SMS QUARANTINED (UI Listener):', analysis.reason);
      } else {
        console.log('✅ SMS ALLOWED (UI Listener) - Processing in Foreground');

        // RESTORED: Handle immediately in foreground to ensure UI responsiveness and reliability
        if (Platform.OS === 'android') {
          // 1. Save to System Inbox
          await SMSModule.saveSmsToInbox(
            smsData.phoneNumber,
            smsData.messageBody,
            smsData.timestamp || Date.now()
          );
          // 2. Show Notification (Native)
          SMSModule.showNotification(smsData.phoneNumber, smsData.messageBody);
        }

        // 3. Log to internal DB
        await databaseService.logInbox({
          phoneNumber: smsData.phoneNumber,
          messageContent: smsData.messageBody,
          timestamp: smsData.timestamp || Date.now()
        });

        DeviceEventEmitter.emit('STATS_UPDATED');
      }
    } catch (error) {
      console.error('❌ Error analyzing SMS:', error);
    }
  };

  static destroy(): void {
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
  }
}






