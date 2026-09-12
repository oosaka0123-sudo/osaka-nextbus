(() => {
  const menuButton = document.getElementById("menu-btn");
  const menu = document.getElementById("app-menu");
  const backdrop = document.getElementById("menu-backdrop");
  const closeButton = document.getElementById("menu-close");

  if (!menuButton || !menu || !backdrop || !closeButton) return;

  const setOpen = (open) => {
    menu.hidden = !open;
    backdrop.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    document.body.classList.toggle("menu-open", open);
    if (open) closeButton.focus();
  };

  menuButton.addEventListener("click", () => {
    setOpen(menu.hidden);
  });

  closeButton.addEventListener("click", () => {
    setOpen(false);
    menuButton.focus();
  });

  backdrop.addEventListener("click", () => {
    setOpen(false);
    menuButton.focus();
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setOpen(false);
      menuButton.focus();
    }
  });
})();
