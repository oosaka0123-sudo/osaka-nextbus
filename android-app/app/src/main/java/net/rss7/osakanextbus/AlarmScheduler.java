package net.rss7.osakanextbus;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

public final class AlarmScheduler {
    public static final String PREFS = "funamachi_native";
    private AlarmScheduler() {}

    public static int schedule(Context context, boolean holiday, String duty, int leadMin, int leadSec, String sound, int volume) {
        cancelAll(context);
        Map<String, String[]> data = holiday ? FunamachiData.holiday() : FunamachiData.weekday();
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;

        long now = System.currentTimeMillis();
        int count = 0;
        for (Map.Entry<String, String[]> e : data.entrySet()) {
            if (!FunamachiData.ALL.equals(duty) && !e.getKey().equals(duty)) continue;
            for (String item : e.getValue()) {
                String hm = item.substring(0, 5);
                String mark = item.substring(5);
                String[] p = hm.split(":");
                Calendar c = Calendar.getInstance();
                c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(p[0]));
                c.set(Calendar.MINUTE, Integer.parseInt(p[1]));
                c.set(Calendar.SECOND, 0);
                c.set(Calendar.MILLISECOND, 0);
                long trigger = c.getTimeInMillis() - ((leadMin * 60L + leadSec) * 1000L);
                if (trigger <= now) continue;

                int requestCode = stableCode(e.getKey(), hm, mark);
                Intent i = new Intent(context, FunamachiAlarmReceiver.class);
                i.putExtra("duty", e.getKey());
                i.putExtra("time", hm);
                i.putExtra("mark", mark);
                i.putExtra("sound", sound);
                i.putExtra("volume", volume);
                PendingIntent pi = PendingIntent.getBroadcast(context, requestCode, i,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                    return -1;
                }
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
                count++;
            }
        }

        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit()
                .putBoolean("enabled", count > 0)
                .putBoolean("holiday", holiday)
                .putString("duty", duty)
                .putInt("leadMin", leadMin)
                .putInt("leadSec", leadSec)
                .putString("sound", sound)
                .putInt("volume", volume)
                .putString("date", new SimpleDateFormat("yyyy-MM-dd", Locale.JAPAN).format(new Date()))
                .apply();
        return count;
    }

    public static void cancelAll(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (Map.Entry<String, String[]> e : FunamachiData.weekday().entrySet()) {
            for (String item : e.getValue()) cancelOne(context, am, e.getKey(), item);
        }
        for (Map.Entry<String, String[]> e : FunamachiData.holiday().entrySet()) {
            for (String item : e.getValue()) cancelOne(context, am, e.getKey(), item);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", false).apply();
    }

    private static void cancelOne(Context context, AlarmManager am, String duty, String item) {
        String hm = item.substring(0, 5);
        String mark = item.substring(5);
        int requestCode = stableCode(duty, hm, mark);
        Intent i = new Intent(context, FunamachiAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(context, requestCode, i,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }

    public static void rescheduleAfterBoot(Context context) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean("enabled", false)) return;
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.JAPAN).format(new Date());
        if (!today.equals(sp.getString("date", ""))) return;
        schedule(context,
                sp.getBoolean("holiday", false),
                sp.getString("duty", FunamachiData.ALL),
                sp.getInt("leadMin", 0),
                sp.getInt("leadSec", 0),
                sp.getString("sound", "beep"),
                sp.getInt("volume", 60));
    }

    private static int stableCode(String duty, String hm, String mark) {
        return Math.abs((duty + "|" + hm + "|" + mark).hashCode());
    }
}
