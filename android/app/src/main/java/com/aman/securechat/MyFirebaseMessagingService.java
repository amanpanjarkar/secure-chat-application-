package com.aman.securechat;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.Random;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MyFirebaseMsgService";
    public static final String CHANNEL_MESSAGES = "messages";
    public static final String CHANNEL_CALLS = "calls";
    public static final String CHANNEL_MISSED_CALLS = "missed_calls";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.d(TAG, "FCM new token: " + token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        createNotificationChannels(getApplicationContext());

        String title = null;
        String body = null;
        Map<String, String> data = remoteMessage.getData();

        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }

        if (title == null && data != null) {
            title = data.get("title");
        }

        if (body == null && data != null) {
            body = data.get("body");
        }

        if (title == null) {
            title = getString(R.string.app_name);
        }

        if (body == null) {
            body = "New secure chat notification";
        }

        String type = data != null ? data.get("type") : null;

        if ("incoming_call".equals(type) || "call".equals(type)) {
            sendIncomingCallNotification(title, body, data);
        } else if ("missed_call".equals(type)) {
            sendNotification(CHANNEL_MISSED_CALLS, title, body);
        } else {
            sendNotification(CHANNEL_MESSAGES, title, body);
        }
    }

    private void sendIncomingCallNotification(String title, String body, Map<String, String> data) {
        Context context = getApplicationContext();

        Intent fullScreenIntent = new Intent(context, IncomingCallActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        if (data != null) {
            if (data.get("callId") != null) {
                fullScreenIntent.putExtra("callId", data.get("callId"));
            }
            if (data.get("callerName") != null) {
                fullScreenIntent.putExtra("callerName", data.get("callerName"));
            }
            if (data.get("callerUid") != null) {
                fullScreenIntent.putExtra("callerUid", data.get("callerUid"));
            }
        }

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                context,
                new Random().nextInt(),
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_CALLS)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));

        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(new Random().nextInt(100000), builder.build());
        }
    }

    private void sendNotification(String channelId, String title, String body) {
        Context context = getApplicationContext();

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                new Random().nextInt(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));

        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(new Random().nextInt(100000), builder.build());
        }
    }

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel messageChannel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        messageChannel.setDescription("Secure Chat message notifications");
        messageChannel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build()
        );
        messageChannel.setShowBadge(true);

        NotificationChannel callChannel = new NotificationChannel(
                CHANNEL_CALLS,
                "Calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        callChannel.setDescription("Incoming call alerts");
        callChannel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
        );
        callChannel.setShowBadge(true);

        NotificationChannel missedChannel = new NotificationChannel(
                CHANNEL_MISSED_CALLS,
                "Missed Calls",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        missedChannel.setDescription("Missed call notifications");
        missedChannel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build()
        );

        notificationManager.createNotificationChannel(messageChannel);
        notificationManager.createNotificationChannel(callChannel);
        notificationManager.createNotificationChannel(missedChannel);
    }
}
