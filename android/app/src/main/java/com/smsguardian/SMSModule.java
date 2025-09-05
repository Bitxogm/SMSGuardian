package com.smsguardian;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.util.Log;

public class SMSModule extends ReactContextBaseJavaModule {
    private static final String TAG = "SMSModule";
    private static ReactApplicationContext reactContext;

    public SMSModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
        Log.d(TAG, "SMSModule initialized");
    }

    @Override
    public String getName() {
        return "SMSModule";
    }

    public static void sendSMSEvent(String phoneNumber, String messageBody, long timestamp) {
        Log.d(TAG, "sendSMSEvent called with: " + phoneNumber);
        
        if (reactContext != null) {
            try {
                WritableMap params = Arguments.createMap();
                params.putString("phoneNumber", phoneNumber);
                params.putString("messageBody", messageBody);
                params.putDouble("timestamp", timestamp);

                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("SMS_RECEIVED", params);

                Log.d(TAG, "SMS event emitted successfully");
            } catch (Exception e) {
                Log.e(TAG, "Error sending SMS event", e);
            }
        } else {
            Log.w(TAG, "React context is null");
        }
    }
}