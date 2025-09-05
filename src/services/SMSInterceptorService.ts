import { DeviceEventEmitter } from 'react-native';
import { SMSAnalysisService } from './SMSAnalysisService';
import { PermissionsService } from './PermissionsService';
import { QuarantineService } from './QuarantineService';

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

        setTimeout(() => {
      console.log('Sending test event...');
      DeviceEventEmitter.emit('SMS_RECEIVED', {
        phoneNumber: '+34999999999',
        messageBody: 'TEST: This is a test message',
        timestamp: Date.now()
      });
    }, 2000);
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
        console.log('⚠️ SMS QUARANTINED:', analysis.reason);
      } else {
        console.log('✅ SMS ALLOWED:', analysis.reason);
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






