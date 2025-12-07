
import { SMSAnalysisService } from './SMSAnalysisService';
import { databaseService } from './DatabaseService';

export const backgroundSmsHandler = async (taskData: any) => {
  console.log('started background SMS task', taskData);
  const { phoneNumber, messageBody } = taskData;

  if (!phoneNumber || !messageBody) {
    console.warn('Background SMS Task missing data:', taskData);
    return;
  }

  try {
    // Ensure database is initialized for this background task
    console.log('Initializing database for background task...');
    await databaseService.initialize();

    // Check if duplicate (simple de-duplication strategy)
    // Note: This might block if currently in use by main app? 
    // SQLite usually handles concurrent connections okay-ish or locks properly.

    const analysis = await SMSAnalysisService.analyzeSMS(phoneNumber, messageBody);
    await SMSAnalysisService.logAnalysis(analysis, { phoneNumber, messageContent: messageBody, timestamp: Date.now() });

    console.log('Background SMS analysis complete:', analysis);
  } catch (error) {
    console.error('Error in background SMS task:', error);
  }
};
