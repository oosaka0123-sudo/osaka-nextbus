(() => {
  const STORAGE_KEY = "nextbus-feedback-draft-v1";
  const ISSUE_URL = "https://github.com/oosaka0123-sudo/osaka-nextbus/issues/new";

  const backButton = document.getElementById("feedback-back");
  const category = document.getElementById("feedback-category");
  const message = document.getElementById("feedback-message");
  const sendLink = document.getElementById("feedback-send");
  const copyButton = document.getElementById("feedback-copy");
  const clearButton = document.getElementById("feedback-clear");
  const status = document.getElementById("feedback-status");

  if (!category || !message || !sendLink || !copyButton || !clearButton || !status) return;

  const setStatus = (text) => {
    status.textContent = text;
  };

  const draftPayload = () => ({
    category: category.value,
    message: message.value,
  });

  const saveDraft = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draftPayload()));
    } catch (_) {
      setStatus("下書きを保存できませんでした。内容をコピーして保管してください。");
    }
  };

  const buildIssueUrl = () => {
    const text = message.value.trim();
    if (!text) return "";

    const params = new URLSearchParams({
      title: `[${category.value}] 次バス大阪`,
      body: `区分: ${category.value}\n\n内容:\n${text}\n\n※現在地・GPS・選択中の停留所や系統などは自動添付されていません。`,
    });
    return `${ISSUE_URL}?${params.toString()}`;
  };

  const updateSendLink = () => {
    const url = buildIssueUrl();
    if (url) {
      sendLink.href = url;
      sendLink.setAttribute("aria-disabled", "false");
      sendLink.classList.remove("is-disabled");
    } else {
      sendLink.removeAttribute("href");
      sendLink.setAttribute("aria-disabled", "true");
      sendLink.classList.add("is-disabled");
    }
  };

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (["改善要望", "不具合報告", "その他"].includes(draft.category)) category.value = draft.category;
      if (typeof draft.message === "string") message.value = draft.message;
    } catch (_) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {
        // localStorage can be unavailable in strict privacy modes.
      }
    }
  };

  const copyFeedback = async () => {
    const text = `区分: ${category.value}\n\n内容:\n${message.value.trim()}`;
    if (!message.value.trim()) {
      setStatus("内容を入力してください。");
      message.focus();
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus("内容をコピーしました。");
    } catch (_) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      setStatus(copied ? "内容をコピーしました。" : "コピーできませんでした。下書きは端末に保存されています。");
    }
  };

  [category, message].forEach((element) => {
    element.addEventListener("input", () => {
      saveDraft();
      updateSendLink();
      setStatus("");
    });
  });

  sendLink.addEventListener("click", (event) => {
    if (!buildIssueUrl()) {
      event.preventDefault();
      setStatus("内容を入力してください。");
      message.focus();
      return;
    }
    saveDraft();
  });

  copyButton.addEventListener("click", copyFeedback);

  clearButton.addEventListener("click", () => {
    category.value = "改善要望";
    message.value = "";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // localStorage unavailable: the in-memory form is still cleared.
    }
    updateSendLink();
    setStatus("下書きを消しました。");
    message.focus();
  });

  if (backButton) {
    backButton.addEventListener("click", () => {
      if (history.length > 1) history.back();
      else location.href = "./";
    });
  }

  restoreDraft();
  updateSendLink();
})();
