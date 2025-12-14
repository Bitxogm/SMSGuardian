package com.smsguardian;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Promise;
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
import android.database.Cursor;
import android.provider.ContactsContract;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.Telephony;

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
                    .setSmallIcon(android.R.drawable.sym_action_chat)
                    .setContentTitle("SMS Guardian: Nuevo Mensaje")
                    .setContentText(phoneNumber + ": " + messageBody)
                    .setPriority(NotificationCompat.PRIORITY_MAX) // HEADS UP
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true);

            NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
            // notificationId is a unique int for each notification that you must define
            notificationManager.notify((int) System.currentTimeMillis(), builder.build());
        } catch (Exception e) {
            Log.e(TAG, "Error showing notification", e);
        }
    }

    @ReactMethod
    public void getDeviceContacts(Promise promise) {
        try {
            WritableArray contactsArray = Arguments.createArray();
            Context context = getReactApplicationContext();
            
            String[] projection = {
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID
            };

            Cursor cursor = context.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );

            if (cursor != null) {
                try {
                    int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                    int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                    int idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);

                    while (cursor.moveToNext()) {
                        String name = cursor.getString(nameIndex);
                        String number = cursor.getString(numberIndex);
                        String id = cursor.getString(idIndex);

                        if (name != null && number != null) {
                            WritableMap contactMap = Arguments.createMap();
                            contactMap.putString("name", name);
                            contactMap.putString("phoneNumber", number);
                            contactMap.putString("id", id);
                            contactsArray.pushMap(contactMap);
                        }
                    }
                    promise.resolve(contactsArray);
                } finally {
                    cursor.close();
                }
            } else {
                promise.resolve(Arguments.createArray());
            }
        } catch (Exception e) {
            promise.reject("CONTACTS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void saveSmsToInbox(String phoneNumber, String messageBody, double timestamp, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            ContentValues values = new ContentValues();
            values.put("address", phoneNumber);
            values.put("body", messageBody);
            values.put("read", 0); // 0 = unread, 1 = read
            values.put("date", (long) timestamp);
            values.put("type", 1); // 1 = Inbox, 2 = Sent

            Uri uri = context.getContentResolver().insert(Telephony.Sms.Inbox.CONTENT_URI, values);
            
            if (uri != null) {
                Log.d(TAG, "SMS saved to inbox: " + uri.toString());
                promise.resolve(true);
            } else {
                Log.e(TAG, "Failed to save SMS to inbox. Is app default SMS handler?");
                promise.resolve(false); 
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saving SMS to inbox", e);
            promise.resolve(false); // Graceful fail
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

                Log.e(TAG, "Event " + eventName + " emitted successfully to JS");
            } catch (Exception e) {
                Log.e(TAG, "Error sending event " + eventName, e);
            }
        } else {
            Log.e(TAG, "React context is null - Cannot emit event " + eventName);
        }
    }
}