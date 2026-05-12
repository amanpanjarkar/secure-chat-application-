package com.aman.securechat;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        MyFirebaseMessagingService.createNotificationChannels(this);
        requestAppPermissions();
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        List<String> requestedPermissions = new ArrayList<>();

        addPermissionIfNeeded(requestedPermissions, Manifest.permission.CAMERA);
        addPermissionIfNeeded(requestedPermissions, Manifest.permission.RECORD_AUDIO);
        addPermissionIfNeeded(requestedPermissions, Manifest.permission.INTERNET);
        addPermissionIfNeeded(requestedPermissions, Manifest.permission.FOREGROUND_SERVICE);
        addPermissionIfNeeded(requestedPermissions, Manifest.permission.POST_NOTIFICATIONS);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            addPermissionIfNeeded(requestedPermissions, Manifest.permission.BLUETOOTH_CONNECT);
            addPermissionIfNeeded(requestedPermissions, Manifest.permission.BLUETOOTH_SCAN);
            addPermissionIfNeeded(requestedPermissions, Manifest.permission.BLUETOOTH_ADVERTISE);
        }

        if (!requestedPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, requestedPermissions.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private void addPermissionIfNeeded(List<String> target, String permission) {
        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            target.add(permission);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // No additional handling required; WebRTC and native notification permissions will be available after this.
    }
}

