package net.rss7.osakanextbus;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class NativeFunamachiAlarmActivity extends Activity {
    private static final int BG = Color.rgb(11,18,32);
    private static final int SURFACE = Color.rgb(18,26,43);
    private static final int PRIMARY = Color.rgb(76,141,255);
    private static final int PRIMARY_STRONG = Color.rgb(234,241,255);
    private static final int TEXT = Color.rgb(244,247,255);
    private static final int DIM = Color.rgb(154,168,199);
    private static final int BORDER = Color.rgb(34,48,80);

    private Spinner day, duty, sound, volume, leadMin, leadSec;
    private TextView caption, countdown, status, summary, timeList;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        prefs = getSharedPreferences(AlarmScheduler.PREFS, MODE_PRIVATE);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(14), dp(16), dp(28));
        scroll.addView(root);

        TextView title = text("船町 乗務アラーム", 19, TEXT, true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, full(dp(44)));

        caption = text("乗務表の丸印時刻をAndroidネイティブで監視", 12, DIM, false);
        caption.setGravity(Gravity.CENTER);
        caption.setPadding(0, 0, 0, dp(8));
        root.addView(caption, full(ViewGroup.LayoutParams.WRAP_CONTENT));

        GridLayout controls = new GridLayout(this);
        controls.setColumnCount(2);
        controls.setUseDefaultMargins(false);
        root.addView(controls, full(ViewGroup.LayoutParams.WRAP_CONTENT));

        day = addField(controls, "日区分", new String[]{"平日","休日"}, 0);
        duty = addField(controls, "勤務", new String[]{"全て鳴らす"}, 1);
        sound = addField(controls, "音を選択", new String[]{"ビープ","チャイム","2連音"}, 2);
        volume = addField(controls, "音量", new String[]{"小","中","大"}, 3);
        leadMin = addField(controls, "何分前", numberStrings(0,59), 4);
        leadSec = addField(controls, "何秒前", numberStrings(0,59), 5);

        LinearLayout countdownCard = card(20);
        countdownCard.setPadding(dp(14), dp(17), dp(14), dp(17));
        countdown = text("残り時間を計算中", 16, DIM, true);
        countdown.setGravity(Gravity.CENTER);
        countdownCard.addView(countdown, full(ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams cp = full(ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.setMargins(0, dp(10), 0, dp(8));
        root.addView(countdownCard, cp);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setWeightSum(2f);

        Button start = styledButton("アラーム開始 / 更新", true);
        start.setOnClickListener(v -> schedule());
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(52), 1f);
        ap.setMargins(0, 0, dp(4), 0);
        actions.addView(start, ap);

        Button test = styledButton("1秒テスト", false);
        test.setOnClickListener(v -> previewSound());
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        tp.setMargins(dp(4), 0, 0, 0);
        actions.addView(test, tp);
        root.addView(actions, full(ViewGroup.LayoutParams.WRAP_CONTENT));

        status = text("", 12, DIM, false);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = full(ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.setMargins(0, dp(7), 0, dp(10));
        root.addView(status, sp);

        LinearLayout listCard = card(16);
        listCard.setPadding(dp(15), dp(14), dp(15), dp(14));
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.BOTTOM);
        TextView h = text("今日の時刻", 15, TEXT, true);
        summary = text("--件", 11, DIM, false);
        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        left.addView(h);
        left.addView(summary);
        head.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView legend = text("○ 白丸　● 黒丸", 11, DIM, false);
        head.addView(legend);
        listCard.addView(head, full(ViewGroup.LayoutParams.WRAP_CONTENT));

        View divider = new View(this);
        divider.setBackgroundColor(BORDER);
        LinearLayout.LayoutParams dpv = full(dp(1));
        dpv.setMargins(0, dp(10), 0, dp(10));
        listCard.addView(divider, dpv);

        timeList = text("", 14, TEXT, true);
        timeList.setLineSpacing(dp(6), 1f);
        listCard.addView(timeList, full(ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(listCard, full(ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout note = card(14);
        note.setPadding(dp(14), dp(12), dp(14), dp(12));
        TextView noteTitle = text("Androidアプリ", 13, TEXT, true);
        TextView noteBody = text("画面OFF・省電力中でも、予約した時刻はAndroidの正確なアラームで鳴動します。", 12, DIM, false);
        noteBody.setPadding(0, dp(5), 0, 0);
        note.addView(noteTitle);
        note.addView(noteBody);
        LinearLayout.LayoutParams np = full(ViewGroup.LayoutParams.WRAP_CONTENT);
        np.setMargins(0, dp(10), 0, 0);
        root.addView(note, np);

        setContentView(scroll);

        day.setOnItemSelectedListener(new SimpleItemSelectedListener() {
            @Override public void onSelected() {
                refreshDuty();
                updateCaption();
                renderTimes();
                updateCountdown();
            }
        });
        duty.setOnItemSelectedListener(new SimpleItemSelectedListener() {
            @Override public void onSelected() { renderTimes(); updateCountdown(); }
        });
        sound.setOnItemSelectedListener(new SimpleItemSelectedListener() {
            @Override public void onSelected() { updateCaption(); }
        });
        leadMin.setOnItemSelectedListener(new SimpleItemSelectedListener() {
            @Override public void onSelected() { updateCaption(); renderTimes(); updateCountdown(); }
        });
        leadSec.setOnItemSelectedListener(new SimpleItemSelectedListener() {
            @Override public void onSelected() { updateCaption(); renderTimes(); updateCountdown(); }
        });

        restore();
        refreshStatus();
        renderTimes();
        updateCaption();
        updateCountdown();
        requestNotificationPermissionIfNeeded();
        handler.post(ticker);
    }

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            updateCountdown();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(ticker);
        super.onDestroy();
    }

    private void schedule() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am != null && !am.canScheduleExactAlarms()) {
                startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName())));
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

        status.setText(count > 0 ? "ネイティブアラーム予約済み：" + count + "件" : "本日これから鳴らす時刻はありません");
        Toast.makeText(this, count + "件のアラームを予約しました", Toast.LENGTH_SHORT).show();
        renderTimes();
        updateCountdown();
    }

    private void previewSound() {
        final int vol = volume.getSelectedItemPosition() == 0 ? 25
                : volume.getSelectedItemPosition() == 2 ? 100 : 60;
        new Thread(() -> {
            ToneGenerator t = new ToneGenerator(AudioManager.STREAM_ALARM, vol);
            try {
                if (sound.getSelectedItemPosition() == 1) {
                    t.startTone(ToneGenerator.TONE_DTMF_5, 420);
                    Thread.sleep(470);
                    t.startTone(ToneGenerator.TONE_DTMF_9, 420);
                    Thread.sleep(470);
                } else if (sound.getSelectedItemPosition() == 2) {
                    t.startTone(ToneGenerator.TONE_PROP_BEEP, 220);
                    Thread.sleep(300);
                    t.startTone(ToneGenerator.TONE_PROP_BEEP, 220);
                    Thread.sleep(300);
                } else {
                    t.startTone(ToneGenerator.TONE_PROP_BEEP, 900);
                    Thread.sleep(950);
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            } finally {
                t.release();
            }
        }).start();
    }

    private void refreshDuty() {
        if (duty == null || day == null) return;
        boolean holiday = day.getSelectedItemPosition() == 1;
        Map<String,String[]> map = holiday ? FunamachiData.holiday() : FunamachiData.weekday();
        int old = duty.getSelectedItemPosition();
        List<String> items = new ArrayList<>();
        items.add("全て鳴らす");
        items.addAll(map.keySet());
        duty.setAdapter(adapter(items.toArray(new String[0])));
        int saved = old >= 0 ? old : prefs.getInt("dutyIndex", 0);
        if (saved < items.size()) duty.setSelection(saved);
    }

    private void restore() {
        int defaultDay;
        if (prefs.contains("dayIndex")) {
            defaultDay = prefs.getInt("dayIndex", 0);
        } else {
            int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
            defaultDay = (dow == Calendar.SATURDAY || dow == Calendar.SUNDAY) ? 1 : 0;
        }
        day.setSelection(defaultDay);
        refreshDuty();
        sound.setSelection(prefs.getInt("soundIndex", 0));
        volume.setSelection(prefs.getInt("volumeIndex", 1));
        leadMin.setSelection(prefs.getInt("leadMinIndex", 0));
        leadSec.setSelection(prefs.contains("leadSecIndex") ? prefs.getInt("leadSecIndex", 30) : 30);
    }

    private void refreshStatus() {
        status.setText(prefs.getBoolean("enabled", false)
                ? "ネイティブアラーム予約あり（本日分）"
                : "アラーム未予約");
    }

    private void updateCaption() {
        if (leadMin == null || leadSec == null) return;
        int m = leadMin.getSelectedItemPosition();
        int s = leadSec.getSelectedItemPosition();
        String when;
        if (m == 0 && s == 0) when = "時刻ちょうど";
        else if (m == 0) when = s + "秒前";
        else if (s == 0) when = m + "分前";
        else when = m + "分" + s + "秒前";
        caption.setText("乗務表の丸印時刻の" + when + "に鳴動");
    }

    private List<String> activeRows() {
        boolean holiday = day.getSelectedItemPosition() == 1;
        Map<String,String[]> data = holiday ? FunamachiData.holiday() : FunamachiData.weekday();
        List<String> out = new ArrayList<>();
        if (duty.getSelectedItemPosition() == 0) {
            Set<String> seen = new LinkedHashSet<>();
            for (String[] rows : data.values()) {
                for (String row : rows) seen.add(row);
            }
            out.addAll(seen);
            out.sort((a,b) -> {
                int c = a.substring(0,5).compareTo(b.substring(0,5));
                return c != 0 ? c : a.compareTo(b);
            });
        } else {
            String key = String.valueOf(duty.getSelectedItem());
            String[] rows = data.get(key);
            if (rows != null) {
                for (String row : rows) out.add(row);
            }
        }
        return out;
    }

    private void renderTimes() {
        if (timeList == null || duty == null) return;
        List<String> rows = activeRows();
        summary.setText(rows.size() + "件");
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < rows.size(); i++) {
            String row = rows.get(i);
            String hm = row.substring(0,5);
            String mark = row.substring(5);
            b.append("黒".equals(mark) ? "● " : "○ ").append(hm);
            if ((i + 1) % 3 == 0) b.append("\n");
            else if (i + 1 < rows.size()) b.append("　");
        }
        timeList.setText(b.toString().trim());
    }

    private void updateCountdown() {
        if (countdown == null || duty == null) return;
        List<String> rows = activeRows();
        if (rows.isEmpty()) {
            countdown.setText("対象時刻がありません");
            return;
        }
        Calendar now = Calendar.getInstance();
        long nowMs = now.getTimeInMillis();
        int lead = leadMin.getSelectedItemPosition() * 60 + leadSec.getSelectedItemPosition();
        long best = Long.MAX_VALUE;
        for (String row : rows) {
            String[] p = row.substring(0,5).split(":");
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(p[0]));
            c.set(Calendar.MINUTE, Integer.parseInt(p[1]));
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            long t = c.getTimeInMillis() - lead * 1000L;
            if (t > nowMs && t < best) best = t;
        }
        if (best == Long.MAX_VALUE) {
            String[] p = rows.get(0).substring(0,5).split(":");
            Calendar c = Calendar.getInstance();
            c.add(Calendar.DAY_OF_YEAR, 1);
            c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(p[0]));
            c.set(Calendar.MINUTE, Integer.parseInt(p[1]));
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            best = c.getTimeInMillis() - lead * 1000L;
        }
        long sec = Math.max(0, (best - nowMs) / 1000L);
        countdown.setText(String.format(Locale.JAPAN, "残り %d分 %d秒", sec / 60, sec % 60));
    }

    private Spinner addField(GridLayout grid, String label, String[] values, int index) {
        LinearLayout box = card(12);
        box.setPadding(dp(10), dp(8), dp(10), dp(8));
        TextView t = text(label, 11, DIM, true);
        box.addView(t, full(ViewGroup.LayoutParams.WRAP_CONTENT));
        Spinner s = new Spinner(this);
        s.setAdapter(adapter(values));
        s.setPopupBackgroundDrawable(round(BG, BORDER, 10));
        box.addView(s, full(dp(42)));

        GridLayout.LayoutParams gp = new GridLayout.LayoutParams(
                GridLayout.spec(index / 2), GridLayout.spec(index % 2, 1f));
        gp.width = 0;
        gp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
        gp.setMargins(index % 2 == 0 ? 0 : dp(4), dp(4), index % 2 == 0 ? dp(4) : 0, dp(4));
        grid.addView(box, gp);
        return s;
    }

    private ArrayAdapter<String> adapter(String[] values) {
        return new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, values) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getView(position, convertView, parent);
                styleSpinnerText(v);
                return v;
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getDropDownView(position, convertView, parent);
                v.setTextColor(TEXT);
                v.setTextSize(16);
                v.setPadding(dp(14), dp(12), dp(14), dp(12));
                v.setBackgroundColor(BG);
                return v;
            }
        };
    }

    private void styleSpinnerText(TextView v) {
        v.setTextColor(TEXT);
        v.setTextSize(16);
        v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        v.setGravity(Gravity.CENTER_VERTICAL);
        v.setPadding(0, 0, dp(4), 0);
    }

    private Button styledButton(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? Color.rgb(8,19,39) : TEXT);
        b.setBackground(round(primary ? PRIMARY : SURFACE, primary ? PRIMARY : BORDER, 12));
        return b;
    }

    private LinearLayout card(int radius) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setBackground(round(SURFACE, BORDER, radius));
        return l;
    }

    private GradientDrawable round(int fill, int stroke, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radius));
        g.setStroke(dp(1), stroke);
        return g;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private String[] numberStrings(int from, int to) {
        String[] a = new String[to - from + 1];
        for (int i = 0; i < a.length; i++) a[i] = String.valueOf(i + from);
        return a;
    }

    private LinearLayout.LayoutParams full(int height) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height);
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

    public abstract static class SimpleItemSelectedListener implements AdapterView.OnItemSelectedListener {
        public abstract void onSelected();
        @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { onSelected(); }
        @Override public void onNothingSelected(AdapterView<?> parent) {}
    }
}
