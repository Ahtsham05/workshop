package com.smsgateway;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class SmsModule extends ReactContextBaseJavaModule {

    private static final String SMS_SENT = "SMS_SENT";
    private static final String SMS_DELIVERED = "SMS_DELIVERED";

    public SmsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "SmsModule";
    }

    @ReactMethod
    public void sendSms(String phoneNumber, String message, int simSlot, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            SmsManager smsManager = getSmsManager(context, simSlot);

            String sentAction = SMS_SENT + "_" + new Random().nextInt(100000);
            String deliveredAction = SMS_DELIVERED + "_" + new Random().nextInt(100000);

            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent sentPI = PendingIntent.getBroadcast(context, 0, new Intent(sentAction), flags);
            PendingIntent deliveredPI = PendingIntent.getBroadcast(context, 0, new Intent(deliveredAction), flags);

            BroadcastReceiver sentReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    ctx.unregisterReceiver(this);
                    if (getResultCode() == Activity.RESULT_OK) {
                        promise.resolve("sent");
                    } else {
                        promise.reject("SMS_FAILED", "SMS send failed with code: " + getResultCode());
                    }
                }
            };

            IntentFilter sentFilter = new IntentFilter(sentAction);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(sentReceiver, sentFilter, Context.RECEIVER_EXPORTED);
            } else {
                context.registerReceiver(sentReceiver, sentFilter);
            }

            // Split long messages automatically
            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() == 1) {
                smsManager.sendTextMessage(phoneNumber, null, message, sentPI, deliveredPI);
            } else {
                ArrayList<PendingIntent> sentIntents = new ArrayList<>();
                ArrayList<PendingIntent> deliveredIntents = new ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    sentIntents.add(i == 0 ? sentPI : null);
                    deliveredIntents.add(i == 0 ? deliveredPI : null);
                }
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, deliveredIntents);
            }

        } catch (Exception e) {
            promise.reject("SMS_ERROR", e.getMessage());
        }
    }

    private SmsManager getSmsManager(Context context, int simSlot) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1 && simSlot > 0) {
            try {
                SubscriptionManager subscriptionManager = SubscriptionManager.from(context);
                List<SubscriptionInfo> subscriptions = subscriptionManager.getActiveSubscriptionInfoList();
                if (subscriptions != null && subscriptions.size() > simSlot) {
                    int subscriptionId = subscriptions.get(simSlot).getSubscriptionId();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        return context.getSystemService(SmsManager.class).createForSubscriptionId(subscriptionId);
                    } else {
                        return SmsManager.getSmsManagerForSubscriptionId(subscriptionId);
                    }
                }
            } catch (Exception ignored) {}
        }
        // Default SIM
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return context.getSystemService(SmsManager.class);
        }
        return SmsManager.getDefault();
    }
}
