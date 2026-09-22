package net.rss7.osakanextbus;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.IBinder;
import android.os.PowerManager;

public class FunamachiAlarmService extends Service {
    public static final String ACTION_STOP = "net.rss7.osakanextbus.STOP_FUNAMACHI_ALARM";
    private static final String CHANNEL = "funamachi_alarm";
    private ToneGenerator tone;
    private PowerManager.WakeLock wakeLock;
    private volatile boolean running;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopAlarm();
            return START_NOT_STICKY;
        }

        String duty = intent != null ? intent.getStringExtra("duty") : "";
        String time = intent != null ? intent.getStringExtra("time") : "";
        String mark = intent != null ? intent.getStringExtra("mark") : "";
        String sound = intent != null ? intent.getStringExtra("sound") : "beep";
        int volume = intent != null ? intent.getIntExtra("volume", 60) : 60;

        Intent stop = new Intent(this, FunamachiAlarmService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 9001, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("船町 乗務アラーム")
                .setContentText(duty + " " + time + " " + mark)
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_media_pause, "停止", stopPi).build())
                .build();
        startForeground(2001, n);

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NextBus:FunamachiAlarm");
            wakeLock.acquire(45_000L);
        }

        running = true;
        final int v = Math.max(10, Math.min(100, volume));
        new Thread(() -> playPattern(sound, v)).start();
        return START_NOT_STICKY;
    }

    private void playPattern(String sound, int volume) {
        tone = new ToneGenerator(AudioManager.STREAM_ALARM, volume);
        long end = System.currentTimeMillis() + 30_000L;
        try {
            while (running && System.currentTimeMillis() < end) {
                if ("double".equals(sound)) {
                    tone.startTone(ToneGenerator.TONE_PROP_BEEP, 250);
                    Thread.sleep(350);
                    tone.startTone(ToneGenerator.TONE_PROP_BEEP, 250);
                    Thread.sleep(900);
                } else if ("chime".equals(sound)) {
                    tone.startTone(ToneGenerator.TONE_DTMF_5, 500);
                    Thread.sleep(1200);
                } else {
                    tone.startTone(ToneGenerator.TONE_PROP_BEEP, 500);
                    Thread.sleep(1200);
                }
            }
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        } finally {
            stopAlarm();
        }
    }

    private void stopAlarm() {
        running = false;
        if (tone != null) {
            tone.stopTone();
            tone.release();
            tone = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void createChannel() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel c = new NotificationChannel(
                CHANNEL, "船町アラーム", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("船町乗務表のアラーム");
        c.setSound(null, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM).build());
        c.enableVibration(true);
        nm.createNotificationChannel(c);
    }

    @Override
    public void onDestroy() {
        stopAlarm();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
