import { databaseService } from './DatabaseService';

export interface QuarantinedSMS {
  id: number;
  phone_number: string;
  message_content: string;
  quarantine_reason: string;
  threat_level: string;
  timestamp: number;
  contains_urls: boolean;
  analyzed_urls: string[];
  is_reviewed: boolean;
  user_action: 'none' | 'deleted' | 'approved' | 'blocked_number';
}

export class QuarantineService {
  static async quarantineSMS(smsData: {
    phoneNumber: string;
    messageContent: string;
    timestamp: number;
    reason: string;
    threatLevel: string;
    urls?: string[];
  }): Promise<void> {
    try {
      await databaseService.quarantineSMS(smsData);
      console.log('SMS quarantined:', smsData.phoneNumber);
    } catch (error) {
      console.error('Error quarantining SMS:', error);
    }
  }

  static async getQuarantinedSMS(): Promise<QuarantinedSMS[]> {
    try {
      return await databaseService.getQuarantinedSMS();
    } catch (error) {
      console.error('Error getting quarantined SMS:', error);
      return [];
    }
  }

  static async markAsReviewed(id: number, userAction: 'deleted' | 'approved' | 'blocked_number'): Promise<void> {
    try {
      await databaseService.markQuarantinedAsReviewed(id, userAction);
    } catch (error) {
      console.error('Error marking SMS as reviewed:', error);
    }
  }

  static async getQuarantinedCount(): Promise<number> {
    try {
      return await databaseService.getQuarantinedCount();
    } catch (error) {
      console.error('Error getting quarantined count:', error);
      return 0;
    }
  }
}