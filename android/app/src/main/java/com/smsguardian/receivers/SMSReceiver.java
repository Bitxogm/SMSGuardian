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
        if ("android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            Log.d(TAG, "SMS_RECEIVED intent received");
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
                            
                            // Bloquear ANTES de enviar a React Native para máxima efectividad
                            if (isKnownSpam(phoneNumber, messageBody)) {
                                Log.i(TAG, "BLOCKING SMS from spam source: " + phoneNumber);
                                abortBroadcast();
                                return; // Salir inmediatamente después del bloqueo
                            }
                            
                            // Solo enviar a React Native si NO se bloqueó
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
        try {
            SMSModule.sendSMSEvent(phoneNumber, messageBody, timestamp);
            Log.d(TAG, "SMS event sent via SMSModule");
        } catch (Exception e) {
            Log.e(TAG, "Error sending SMS via module", e);
        }
    }
    
    private boolean isKnownSpam(String phoneNumber, String messageBody) {
        return phoneNumber.equals("+34666123456") || 
               phoneNumber.equals("+34911234567") ||
               messageBody.toLowerCase().contains("bit.ly");
    }
}