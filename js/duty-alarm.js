(() => {
  "use strict";

  const schedules = {
    weekday: {
      "1¹": [
        ["06:15","black"],["07:00","white"],["07:15","white"],["07:30","black"],["07:40","black"],
        ["08:10","white"],["08:20","white"],["08:30","black"],["08:45","black"],
        ["09:40","white"],["10:00","white"],["10:20","black"],["10:40","black"],
        ["11:40","white"],["12:00","white"],["12:20","black"],["12:40","black"],["13:40","white"]
      ],
      "1²": [
        ["06:15","white"],["06:30","black"],["06:45","black"],["07:30","white"],["07:40","white"],["07:50","black"],["08:00","black"],
        ["08:30","white"],["08:45","white"],["09:00","black"],["09:20","black"],
        ["10:20","white"],["10:40","white"],["11:00","black"],["11:20","black"],
        ["12:20","white"],["12:40","white"],["13:00","black"],["13:20","black"]
      ],
      "1³": [
        ["06:30","white"],["06:45","white"],["07:00","black"],["07:15","black"],
        ["07:50","white"],["08:00","white"],["08:10","black"],["08:20","black"],
        ["09:00","white"],["09:20","white"],["09:40","black"],["10:00","black"],
        ["11:00","white"],["11:20","white"],["11:40","black"],["12:00","black"],
        ["13:00","white"],["13:20","white"],["13:40","black"]
      ],
      "5¹": [
        ["14:00","black"],["15:00","white"],["15:20","white"],["15:40","black"],["16:00","black"],
        ["17:00","white"],["17:15","white"],["17:30","black"],["17:40","black"],
        ["18:10","white"],["18:20","white"],["18:30","black"],["18:45","black"],
        ["19:30","white"],["19:45","white"],["20:00","black"],["20:15","black"],["21:00","white"]
      ],
      "5²": [
        ["14:00","white"],["14:20","black"],["14:40","black"],["15:40","white"],["16:00","white"],["16:20","black"],["16:40","black"],
        ["17:30","white"],["17:40","white"],["17:50","black"],["18:00","black"],
        ["18:30","white"],["18:45","white"],["19:00","black"],["19:15","black"],
        ["20:00","white"],["20:15","white"],["20:30","black"],["20:45","black"]
      ],
      "5³": [
        ["14:20","white"],["14:40","white"],["15:00","black"],["15:20","black"],
        ["16:20","white"],["16:40","white"],["17:00","black"],["17:15","black"],
        ["17:50","white"],["18:00","white"],["18:10","black"],["18:20","black"],
        ["19:00","white"],["19:15","white"],["19:30","black"],["19:45","black"],
        ["20:30","white"],["20:45","white"],["21:00","black"]
      ]
    },
    holiday: {
      "1¹": [
        ["06:30","black"],["07:15","white"],["07:30","white"],["07:45","black"],["08:00","black"],
        ["08:45","white"],["09:00","white"],["09:20","black"],["09:40","black"],
        ["10:40","white"],["11:00","white"],["11:20","black"],["11:40","black"],["12:40","white"],["13:00","white"]
      ],
      "1²": [
        ["06:30","white"],["06:45","black"],["07:00","black"],["07:45","white"],["08:00","white"],["08:15","black"],["08:30","black"],
        ["09:20","white"],["09:40","white"],["10:00","black"],["10:20","black"],
        ["11:20","white"],["11:40","white"],["12:00","black"],["12:20","black"]
      ],
      "1³": [
        ["06:45","white"],["07:00","white"],["07:15","black"],["07:30","black"],
        ["08:15","white"],["08:30","white"],["08:45","black"],["09:00","black"],
        ["10:00","white"],["10:20","white"],["10:40","black"],["11:00","black"],
        ["12:00","white"],["12:20","white"],["12:40","black"],["13:00","black"]
      ],
      "4¹": [
        ["13:20","black"],["13:40","black"],["14:40","white"],["15:00","white"],["15:20","black"],["15:40","black"],
        ["16:40","white"],["17:00","white"],["17:20","black"],["17:40","black"],
        ["18:40","white"],["19:00","white"],["19:20","black"],["19:40","black"],["20:40","white"]
      ],
      "4²": [
        ["13:20","white"],["13:40","white"],["14:00","black"],["14:20","black"],
        ["15:20","white"],["15:40","white"],["16:00","black"],["16:20","black"],
        ["17:20","white"],["17:40","white"],["18:00","black"],["18:20","black"],
        ["19:20","white"],["19:40","white"],["20:00","black"],["20:20","black"]
      ],
      "4³": [
        ["14:00","white"],["14:20","white"],["14:40","black"],["15:00","black"],
        ["16:00","white"],["16:20","white"],["16:40","black"],["17:00","black"],
        ["18:00","white"],["18:20","white"],["18:40","black"],["19:00","black"],
        ["20:00","white"],["20:20","white"],["20:40","black"]
      ]
    }
  };

  const dayEl = document.getElementById("alarm-day");
  const dutyGridEl = document.getElementById("alarm-duty-grid");
  const soundGridEl = document.getElementById("alarm-sound-grid");
  const volumeGridEl = document.getElementById("alarm-volume-grid");
  const leadMinutesEl = document.getElementById("alarm-lead-minutes");
  const leadSecondsEl = document.getElementById("alarm-lead-seconds");
  const captionEl = document.getElementById("alarm-caption");
  const allEl = document.getElementById("alarm-all");
  const countdownEl = document.getElementById("alarm-countdown");
  const testEl = document.getElementById("alarm-test");
  const statusEl = document.getElementById("alarm-status");
  const listEl = document.getElementById("alarm-time-list");
  const summaryEl = document.getElementById("alarm-list-summary");

  let audioContext = null;
  let soundEnabled = true;
  let wakeLock = null;
  let firedKey = "";
  let allMode = localStorage.getItem("funamachi-alarm-all") === "true";
  let currentSound = localStorage.getItem("funamachi-alarm-sound") || "beep";
  let currentVolume = localStorage.getItem("funamachi-alarm-volume") || "medium";

  const savedDay = localStorage.getItem("funamachi-alarm-day");
  const today = new Date().getDay();
  dayEl.value = savedDay || ((today === 0 || today === 6) ? "holiday" : "weekday");
  leadMinutesEl.value = localStorage.getItem("funamachi-alarm-lead-minutes") || "0";
  leadSecondsEl.value = localStorage.getItem("funamachi-alarm-lead-seconds") || "30";

  const dutiesByDay = {
    weekday: ["1¹","1²","1³","5¹","5²","5³"],
    holiday: ["1¹","1²","1³","4¹","4²","4³"]
  };
  const allDuties = [...new Set([...dutiesByDay.weekday, ...dutiesByDay.holiday])];
  let currentDuty = allDuties.includes(localStorage.getItem("funamachi-alarm-duty"))
    ? localStorage.getItem("funamachi-alarm-duty")
    : "1¹";

  function dutiesForCurrentDay() {
    return dutiesByDay[dayEl.value] || dutiesByDay.weekday;
  }

  function normalizeDutyForDay(duty) {
    const allowed = dutiesForCurrentDay();
    if (allowed.includes(duty)) return duty;

    const suffix = duty.slice(-1);
    const counterpart = dayEl.value === "holiday" ? "4" + suffix : "5" + suffix;
    if (allowed.includes(counterpart)) return counterpart;

    return "1¹";
  }

  function syncDutyButtons() {
    allEl.setAttribute("aria-pressed", String(allMode));
    allEl.classList.toggle("is-selected", allMode);
    dutyGridEl.querySelectorAll(".alarm-duty-option").forEach((button) => {
      const selected = !allMode && button.dataset.duty === currentDuty;
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle("is-selected", selected);
    });
  }

  function setDuty(duty) {
    allMode = false;
    localStorage.setItem("funamachi-alarm-all", "false");
    currentDuty = normalizeDutyForDay(duty);
    localStorage.setItem("funamachi-alarm-duty", currentDuty);
    syncDutyButtons();
    firedKey = "";
    renderList();
    updateClock();
  }

  function toggleAllMode() {
    allMode = !allMode;
    localStorage.setItem("funamachi-alarm-all", String(allMode));
    syncDutyButtons();
    firedKey = "";
    renderList();
    updateClock();
  }

  function populateDuties() {
    currentDuty = normalizeDutyForDay(currentDuty);
    localStorage.setItem("funamachi-alarm-duty", currentDuty);
    dutyGridEl.textContent = "";
    dutiesForCurrentDay().forEach((duty) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "alarm-duty-option";
      button.dataset.duty = duty;
      button.textContent = duty;
      button.setAttribute("role", "radio");
      button.addEventListener("click", () => setDuty(duty));
      dutyGridEl.appendChild(button);
    });
    syncDutyButtons();
  }

  function activeSchedule() {
    if (!allMode) return schedules[dayEl.value][currentDuty] || [];

    const merged = [];
    const seen = new Set();
    dutiesForCurrentDay().forEach((duty) => {
      (schedules[dayEl.value][duty] || []).forEach(([time, mark]) => {
        const key = time + "|" + mark;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push([time, mark]);
        }
      });
    });
    merged.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    return merged;
  }

  function dateAt(time, addDay = 0) {
    const [h,m] = time.split(":").map(Number);
    const d = new Date();
    d.setDate(d.getDate() + addDay);
    d.setHours(h,m,0,0);
    return d;
  }

  function clampInt(value, min, max) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function leadParts() {
    const minutes = clampInt(leadMinutesEl.value, 0, 59);
    const seconds = clampInt(leadSecondsEl.value, 0, 59);
    return { minutes, seconds };
  }

  function leadMs() {
    const { minutes, seconds } = leadParts();
    return (minutes * 60 + seconds) * 1000;
  }

  function leadText() {
    const { minutes, seconds } = leadParts();
    if (minutes === 0 && seconds === 0) return "時刻ちょうど";
    if (minutes === 0) return seconds + "秒前";
    if (seconds === 0) return minutes + "分前";
    return minutes + "分" + seconds + "秒前";
  }

  function syncLeadUi() {
    const { minutes, seconds } = leadParts();
    leadMinutesEl.value = String(minutes);
    leadSecondsEl.value = String(seconds);
    localStorage.setItem("funamachi-alarm-lead-minutes", String(minutes));
    localStorage.setItem("funamachi-alarm-lead-seconds", String(seconds));
    const text = leadText();
    captionEl.textContent = "乗務表の丸印時刻の" + text + "に約1秒だけ鳴動";
  }

  function alarmAt(eventDate) {
    return new Date(eventDate.getTime() - leadMs());
  }

  function findNext(now = new Date()) {
    const rows = activeSchedule();
    for (const item of rows) {
      const eventDate = dateAt(item[0], 0);
      const alarmDate = alarmAt(eventDate);
      if (alarmDate > now) return { item, eventDate, alarmDate, tomorrow: false };
    }
    if (!rows.length) return null;
    const eventDate = dateAt(rows[0][0], 1);
    return { item: rows[0], eventDate, alarmDate: alarmAt(eventDate), tomorrow: true };
  }

  function renderList() {
    const rows = activeSchedule();
    const now = new Date();
    const next = findNext(now);
    listEl.textContent = "";
    rows.forEach(([time,mark]) => {
      const li = document.createElement("li");
      li.className = "alarm-time-item";
      const eventDate = dateAt(time);
      if (alarmAt(eventDate) < now) li.classList.add("is-past");
      if (next && !next.tomorrow && next.item[0] === time && next.item[1] === mark) li.classList.add("is-next");
      const dot = document.createElement("i");
      dot.className = "dot " + (mark === "black" ? "dot-black" : "dot-white");
      dot.setAttribute("aria-hidden","true");
      const span = document.createElement("span");
      span.textContent = time;
      li.append(dot, span);
      listEl.appendChild(li);
    });
    summaryEl.textContent = rows.length + "件";
  }

  function updateClock() {
    const now = new Date();
    const next = findNext(now);
    if (!next) {
      countdownEl.textContent = "対象時刻がありません";
      return;
    }
    const seconds = Math.max(0, Math.floor((next.alarmDate - now) / 1000));
    const totalMinutes = Math.floor(seconds / 60);
    const s = seconds % 60;
    countdownEl.textContent = "残り " + totalMinutes + "分 " + s + "秒";

    if (soundEnabled) {
      for (const item of activeSchedule()) {
        const eventDate = dateAt(item[0], 0);
        const target = alarmAt(eventDate);
        const delta = now.getTime() - target.getTime();
        const dateKey = target.toISOString() + "|" + dayEl.value + "|" + (allMode ? "ALL" : currentDuty);
        if (delta >= 0 && delta < 2000 && firedKey !== dateKey) {
          firedKey = dateKey;
          beep();
          break;
        }
      }
    }
    if (now.getSeconds() % 10 === 0) renderList();
  }

  async function prepareAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      statusEl.textContent = "このブラウザは音声機能に対応していません";
      return false;
    }
    if (!audioContext) audioContext = new Ctx();
    try {
      if (audioContext.state === "suspended") await audioContext.resume();
    } catch (_) {}
    soundEnabled = true;
    statusEl.textContent = audioContext.state === "running"
      ? "アプリ起動中は自動監視"
      : "最初の画面操作後から自動で鳴動";
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch (_) {}
    return audioContext.state === "running";
  }

  function volumeLevel() {
    return currentVolume === "low" ? 0.14 : currentVolume === "high" ? 0.55 : 0.32;
  }

  function playTone(frequency, startOffset, duration, level) {
    const start = audioContext.currentTime + startOffset;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = currentSound === "chime" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.012);
    gain.gain.setValueAtTime(level, Math.max(start + 0.02, start + duration - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  async function beep(preview = false) {
    const ready = await prepareAudio();
    if (!ready || !audioContext) return;
    const level = volumeLevel();
    const duration = preview ? 0.32 : 0.95;

    if (currentSound === "chime") {
      playTone(880, 0, duration * 0.55, level);
      playTone(1320, duration * 0.40, duration * 0.55, level);
    } else if (currentSound === "double") {
      playTone(1050, 0, preview ? 0.13 : 0.30, level);
      playTone(1050, preview ? 0.18 : 0.40, preview ? 0.13 : 0.30, level);
    } else {
      playTone(1000, 0, duration, level);
    }
  }

  function syncAudioChoiceButtons() {
    soundGridEl.querySelectorAll("[data-sound]").forEach((button) => {
      const selected = button.dataset.sound === currentSound;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    volumeGridEl.querySelectorAll("[data-volume]").forEach((button) => {
      const selected = button.dataset.volume === currentVolume;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  }

  function chooseSound(sound) {
    currentSound = ["beep","chime","double"].includes(sound) ? sound : "beep";
    localStorage.setItem("funamachi-alarm-sound", currentSound);
    syncAudioChoiceButtons();
    beep(true);
  }

  function chooseVolume(volume) {
    currentVolume = ["low","medium","high"].includes(volume) ? volume : "medium";
    localStorage.setItem("funamachi-alarm-volume", currentVolume);
    syncAudioChoiceButtons();
    beep(true);
  }

  dayEl.addEventListener("change", () => {
    localStorage.setItem("funamachi-alarm-day", dayEl.value);
    populateDuties();
    firedKey = "";
    renderList();
    updateClock();
  });
  [leadMinutesEl, leadSecondsEl].forEach((input) => {
    input.addEventListener("change", () => {
      syncLeadUi();
      firedKey = "";
      renderList();
      updateClock();
    });
    input.addEventListener("input", () => {
      syncLeadUi();
      renderList();
      updateClock();
    });
  });
  allEl.addEventListener("click", () => {
    prepareAudio();
    toggleAllMode();
  });
  soundGridEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sound]");
    if (button) chooseSound(button.dataset.sound);
  });
  volumeGridEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-volume]");
    if (button) chooseVolume(button.dataset.volume);
  });
  testEl.addEventListener("click", () => beep(false));

  const unlockAudio = () => {
    prepareAudio();
    window.removeEventListener("pointerdown", unlockAudio, true);
    window.removeEventListener("keydown", unlockAudio, true);
  };
  window.addEventListener("pointerdown", unlockAudio, true);
  window.addEventListener("keydown", unlockAudio, true);

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && soundEnabled && "wakeLock" in navigator && !wakeLock) {
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch (_) {}
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  populateDuties();
  syncLeadUi();
  syncAudioChoiceButtons();
  prepareAudio();
  renderList();
  updateClock();
  setInterval(updateClock, 250);
})();