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
  const dutyEl = document.getElementById("alarm-duty");
  const markEl = document.getElementById("alarm-mark");
  const nextEl = document.getElementById("alarm-next-time");
  const countdownEl = document.getElementById("alarm-countdown");
  const enableEl = document.getElementById("alarm-enable");
  const testEl = document.getElementById("alarm-test");
  const statusEl = document.getElementById("alarm-status");
  const listEl = document.getElementById("alarm-time-list");
  const summaryEl = document.getElementById("alarm-list-summary");

  let audioContext = null;
  let soundEnabled = false;
  let wakeLock = null;
  let firedKey = "";

  const savedDay = localStorage.getItem("funamachi-alarm-day");
  const today = new Date().getDay();
  dayEl.value = savedDay || ((today === 0 || today === 6) ? "holiday" : "weekday");
  markEl.value = localStorage.getItem("funamachi-alarm-mark") || "both";

  function populateDuties() {
    const previous = localStorage.getItem("funamachi-alarm-duty");
    dutyEl.textContent = "";
    Object.keys(schedules[dayEl.value]).forEach((duty) => {
      const option = document.createElement("option");
      option.value = duty;
      option.textContent = duty;
      dutyEl.appendChild(option);
    });
    if (previous && schedules[dayEl.value][previous]) dutyEl.value = previous;
    localStorage.setItem("funamachi-alarm-duty", dutyEl.value);
  }

  function activeSchedule() {
    const all = schedules[dayEl.value][dutyEl.value] || [];
    if (markEl.value === "both") return all;
    return all.filter((item) => item[1] === markEl.value);
  }

  function dateAt(time, addDay = 0) {
    const [h,m] = time.split(":").map(Number);
    const d = new Date();
    d.setDate(d.getDate() + addDay);
    d.setHours(h,m,0,0);
    return d;
  }

  function findNext(now = new Date()) {
    const rows = activeSchedule();
    for (const item of rows) {
      const d = dateAt(item[0], 0);
      if (d > now) return { item, date: d, tomorrow: false };
    }
    if (!rows.length) return null;
    return { item: rows[0], date: dateAt(rows[0][0], 1), tomorrow: true };
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
      if (eventDate < now) li.classList.add("is-past");
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
      nextEl.textContent = "--:--";
      countdownEl.textContent = "対象時刻がありません";
      return;
    }
    nextEl.textContent = next.item[0] + (next.tomorrow ? " 明日" : "");
    const seconds = Math.max(0, Math.floor((next.date - now) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    countdownEl.textContent = "あと " + h + "時間 " + m + "分 " + s + "秒";

    const hhmm = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
    const dateKey = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0")+" "+hhmm+"|"+dayEl.value+"|"+dutyEl.value+"|"+markEl.value;
    if (soundEnabled && now.getSeconds() <= 1 && activeSchedule().some((item) => item[0] === hhmm) && firedKey !== dateKey) {
      firedKey = dateKey;
      beep();
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
    if (audioContext.state === "suspended") await audioContext.resume();
    soundEnabled = true;
    enableEl.textContent = "音声ON";
    enableEl.classList.add("is-on");
    statusEl.textContent = "音声ON・ページを開いたまま使用";
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch (_) {
      statusEl.textContent = "音声ON（画面スリープ防止は利用不可）";
    }
    return true;
  }

  async function beep() {
    const ready = soundEnabled ? true : await prepareAudio();
    if (!ready || !audioContext) return;
    const start = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1000, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.015);
    gain.gain.setValueAtTime(0.35, start + 0.94);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.0);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.01);
  }

  dayEl.addEventListener("change", () => {
    localStorage.setItem("funamachi-alarm-day", dayEl.value);
    populateDuties();
    renderList();
    updateClock();
  });
  dutyEl.addEventListener("change", () => {
    localStorage.setItem("funamachi-alarm-duty", dutyEl.value);
    renderList();
    updateClock();
  });
  markEl.addEventListener("change", () => {
    localStorage.setItem("funamachi-alarm-mark", markEl.value);
    renderList();
    updateClock();
  });
  enableEl.addEventListener("click", prepareAudio);
  testEl.addEventListener("click", beep);

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && soundEnabled && "wakeLock" in navigator && !wakeLock) {
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch (_) {}
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  populateDuties();
  renderList();
  updateClock();
  setInterval(updateClock, 250);
})();