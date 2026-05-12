package com.aman.securechat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class IncomingCallActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );

        setContentView(R.layout.activity_incoming_call);

        String callerName = getIntent().getStringExtra("callerName");
        final String callId = getIntent().getStringExtra("callId");

        TextView callerText = findViewById(R.id.incoming_call_title);
        if (callerName != null && !callerName.isEmpty()) {
            callerText.setText(getString(R.string.incoming_call_from, callerName));
        }

        Button answerButton = findViewById(R.id.answer_call_button);
        Button rejectButton = findViewById(R.id.reject_call_button);

        answerButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                launchMainActivity(callId, true);
            }
        });

        rejectButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                launchMainActivity(callId, false);
            }
        });
    }

    private void launchMainActivity(String callId, boolean answer) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        String uriString = "https://securechat.app/incoming";

        if (callId != null) {
            uriString += "?callId=" + Uri.encode(callId);
            uriString += "&answer=" + answer;
        }

        intent.setData(Uri.parse(uriString));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
