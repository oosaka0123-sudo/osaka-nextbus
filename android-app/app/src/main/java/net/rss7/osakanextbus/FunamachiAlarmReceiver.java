package net.rss7.osakanextbus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class FunamachiAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent s = new Intent(context, FunamachiAlarmService.class);
        s.putExtras(intent);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(s);
        } else {
            context.startService(s);
        }
    }
}
