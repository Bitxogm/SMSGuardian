package com.smsguardian.receivers;

import com.smsguardian.SMSModule;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

public class SMSReceiver extends BroadcastReceiver {
    private static final String TAG = "SMSGuardian";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        if ("android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction()) || "android.provider.Telephony.SMS_DELIVER".equals(intent.getAction())) {
            Log.d(TAG, "SMS_RECEIVED intent received");
            
            // DEBUG TOAST
            android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
            handler.post(new Runnable() {
                public void run() {
                    android.widget.Toast.makeText(context, "SMSGuardian Native: SMS Received!", android.widget.Toast.LENGTH_LONG).show();
                }
            });

            Bundle bundle = intent.getExtras();
            
            if (bundle != null) {
                try {
                    Object[] pdus = (Object[]) bundle.get("pdus");
                    String format = bundle.getString("format");
                    
                    if (pdus != null) {
                        for (Object pdu : pdus) {
                            SmsMessage smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
                            
                            String phoneNumber = smsMessage.getOriginatingAddress();
                            String messageBody = smsMessage.getMessageBody();
                            long timestamp = smsMessage.getTimestampMillis();
                            
                            Log.d(TAG, "SMS intercepted from: " + phoneNumber);
                            Log.d(TAG, "Message: " + messageBody);
                            
                            
                            // PASS ALL TO JS (JS will decide to block or notify)
                            sendSMSToReactNative(context, phoneNumber, messageBody, timestamp);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error processing SMS", e);
                }
            }
        }
    }
    
    private void sendSMSToReactNative(Context context, String phoneNumber, String messageBody, long timestamp) {
        // 1. Try to send to active React Native instance
        try {
            SMSModule.sendSMSEvent(phoneNumber, messageBody, timestamp);
            Log.d(TAG, "SMS event passed to React Native Module");
        } catch (Exception e) {
            Log.e(TAG, "Error sending SMS via module", e);
        }

        // 2. Always start Headless Service to ensure background processing
        // The JS side should handle deduplication if necessary
        try {
            Intent serviceIntent = new Intent(context, com.smsguardian.services.HeadlessSmsSendService.class);
            Bundle bundle = new Bundle();
            bundle.putString("phoneNumber", phoneNumber);
            bundle.putString("messageBody", messageBody);
            bundle.putLong("timestamp", timestamp);
            serviceIntent.putExtras(bundle);
            
            context.startService(serviceIntent);
            com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(context);
            Log.d(TAG, "Headless Service started");
        } catch (Exception e) {
            Log.e(TAG, "Error starting Headless Service", e);
        }
    }
}