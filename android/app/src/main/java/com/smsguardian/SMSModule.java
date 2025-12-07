package com.smsguardian;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.util.Log;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import android.app.PendingIntent;
import android.content.Intent;

public class SMSModule extends ReactContextBaseJavaModule {
    private static final String TAG = "SMSModule";
    private static ReactApplicationContext reactContext;
    private static final String CHANNEL_ID = "sms_guardian_channel";

    public SMSModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
        Log.d(TAG, "SMSModule initialized");
    }

    @Override
    public String getName() {
        return "SMSModule";
    }

    @ReactMethod
    public void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "SMS Guardian Notifications";
            String description = "Notifications for valid SMS messages";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            
            NotificationManager notificationManager = reactContext.getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @ReactMethod
    public void showNotification(String phoneNumber, String messageBody) {
        try {
            Context context = getReactApplicationContext();
            Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intent != null) {
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.sym_action_chat) // Use a default system icon or app icon
                    .setContentTitle("SMS: " + phoneNumber)
                    .setContentText(messageBody)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true);

            NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
            // notificationId is a unique int for each notification that you must define
            notificationManager.notify((int) System.currentTimeMillis(), builder.build());
        } catch (Exception e) {
            Log.e(TAG, "Error showing notification", e);
        }
    }

    public static void sendSMSEvent(String phoneNumber, String messageBody, long timestamp) {
        sendLogEvent("SMS_RECEIVED", phoneNumber, messageBody, timestamp, null);
    }

    public static void sendBlockedSMSEvent(String phoneNumber, String messageBody, long timestamp, String reason) {
        sendLogEvent("SMS_BLOCKED", phoneNumber, messageBody, timestamp, reason);
    }

    private static void sendLogEvent(String eventName, String phoneNumber, String messageBody, long timestamp, String reason) {
        Log.d(TAG, "Sending event: " + eventName + " for " + phoneNumber);
        
        if (reactContext != null) {
            try {
                WritableMap params = Arguments.createMap();
                params.putString("phoneNumber", phoneNumber);
                params.putString("messageBody", messageBody);
                params.putDouble("timestamp", timestamp);
                if (reason != null) {
                    params.putString("reason", reason);
                }

                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);

                Log.d(TAG, "Event " + eventName + " emitted successfully");
            } catch (Exception e) {
                Log.e(TAG, "Error sending event " + eventName, e);
            }
        } else {
            Log.w(TAG, "React context is null");
        }
    }
}