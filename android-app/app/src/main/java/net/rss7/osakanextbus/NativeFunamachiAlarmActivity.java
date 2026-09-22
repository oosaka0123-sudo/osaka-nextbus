package net.rss7.osakanextbus;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class NativeFunamachiAlarmActivity extends Activity {
    private Spinner day, duty, sound, volume, leadMin, leadSec;
    private TextView status;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(AlarmScheduler.PREFS, MODE_PRIVATE);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(18);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("船町 乗務アラーム");
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView desc = new TextView(this);
        desc.setText("画面OFFでもAndroidの正確なアラームで鳴動します。\n休日=4系 / 平日=5系");
        desc.setTextSize(15);
        desc.setPadding(0, dp(8), 0, dp(18));
        root.addView(desc);

        day = addSpinner(root, "日区分", new String[]{"平日","休日"});
        duty = addSpinner(root, "勤務", new String[]{"全て鳴らす"});
        sound = addSpinner(root, "音", new String[]{"ビープ","チャイム","ダブル"});
        volume = addSpinner(root, "音量", new String[]{"小","中","大"});
        leadMin = addSpinner(root, "何分前", numberStrings(0,59));
        leadSec = addSpinner(root, "何秒前", numberStrings(0,59));

        day.setOnItemSelectedListener(new SimpleItemSelectedListener() {
            @Override public void onSelected() { refreshDuty(); }
        });

        Button start = new Button(this);
        start.setText("アラーム開始 / 更新");
        start.setTextSize(18);
        start.setOnClickListener(v -> schedule());
        root.addView(start, lp());

        Button stop = new Button(this);
        stop.setText("全アラーム解除");
        stop.setOnClickListener(v -> {
            AlarmScheduler.cancelAll(this);
            status.setText("アラームは解除されています");
            Toast.makeText(this, "全アラームを解除しました", Toast.LENGTH_SHORT).show();
        });
        root.addView(stop, lp());

        status = new TextView(this);
        status.setTextSize(16);
        status.setPadding(0, dp(18), 0, dp(20));
        root.addView(status);

        setContentView(scroll);
        restore();
        refreshStatus();
        requestNotificationPermissionIfNeeded();
    }

    private void schedule() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am != null && !am.canScheduleExactAlarms()) {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName()));
                startActivity(i);
                Toast.makeText(this, "「アラームとリマインダー」を許可してから、もう一度開始してください", Toast.LENGTH_LONG).show();
                return;
            }
        }

        boolean holiday = day.getSelectedItemPosition() == 1;
        String selectedDuty = duty.getSelectedItemPosition() == 0
                ? FunamachiData.ALL : String.valueOf(duty.getSelectedItem());
        String s = sound.getSelectedItemPosition() == 1 ? "chime"
                : sound.getSelectedItemPosition() == 2 ? "double" : "beep";
        int vol = volume.getSelectedItemPosition() == 0 ? 25
                : volume.getSelectedItemPosition() == 2 ? 100 : 60;
        int lm = Integer.parseInt(String.valueOf(leadMin.getSelectedItem()));
        int ls = Integer.parseInt(String.valueOf(leadSec.getSelectedItem()));

        int count = AlarmScheduler.schedule(this, holiday, selectedDuty, lm, ls, s, vol);
        if (count == -1) {
            Toast.makeText(this, "正確なアラーム権限が必要です", Toast.LENGTH_LONG).show();
            return;
        }
        prefs.edit()
                .putInt("dayIndex", day.getSelectedItemPosition())
                .putInt("dutyIndex", duty.getSelectedItemPosition())
                .putInt("soundIndex", sound.getSelectedItemPosition())
                .putInt("volumeIndex", volume.getSelectedItemPosition())
                .putInt("leadMinIndex", leadMin.getSelectedItemPosition())
                .putInt("leadSecIndex", leadSec.getSelectedItemPosition())
                .apply();
        status.setText(count > 0 ? "本日これから " + count + " 件を予約しました" : "本日これから鳴らす時刻はありません");
        Toast.makeText(this, count + "件のアラームを予約しました", Toast.LENGTH_SHORT).show();
    }

    private void refreshDuty() {
        boolean holiday = day.getSelectedItemPosition() == 1;
        Map<String,String[]> map = holiday ? FunamachiData.holiday() : FunamachiData.weekday();
        List<String> items = new ArrayList<>();
        items.add("全て鳴らす");
        items.addAll(map.keySet());
        ArrayAdapter<String> a = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, items);
        duty.setAdapter(a);
        int saved = prefs.getInt("dutyIndex", 0);
        if (saved < items.size()) duty.setSelection(saved);
    }

    private void restore() {
        day.setSelection(prefs.getInt("dayIndex", 0));
        refreshDuty();
        sound.setSelection(prefs.getInt("soundIndex", 0));
        volume.setSelection(prefs.getInt("volumeIndex", 1));
        leadMin.setSelection(prefs.getInt("leadMinIndex", 0));
        leadSec.setSelection(prefs.getInt("leadSecIndex", 0));
    }

    private void refreshStatus() {
        boolean enabled = prefs.getBoolean("enabled", false);
        status.setText(enabled ? "アラーム予約あり（本日分）" : "アラームはまだ予約されていません");
    }

    private Spinner addSpinner(LinearLayout root, String label, String[] values) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(14);
        t.setPadding(0, dp(12), 0, dp(4));
        root.addView(t);
        Spinner s = new Spinner(this);
        ArrayAdapter<String> a = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, values);
        s.setAdapter(a);
        root.addView(s, lp());
        return s;
    }

    private String[] numberStrings(int from, int to) {
        String[] a = new String[to - from + 1];
        for (int i = 0; i < a.length; i++) a[i] = String.valueOf(i + from);
        return a;
    }

    private LinearLayout.LayoutParams lp() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, dp(8), 0, dp(8));
        return p;
    }

    private int dp(int n) {
        return (int) (n * getResources().getDisplayMetrics().density);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 3001);
        }
    }

    public abstract static class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
        public abstract void onSelected();
        @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) { onSelected(); }
        @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
    }
}
