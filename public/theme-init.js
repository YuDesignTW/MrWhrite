// Apply the saved appearance before the page paints. This is a same-origin
// external script so it also works with the production Content Security Policy.
(() => {
  let theme = "dark";
  try {
    if (localStorage.getItem("mrwhite-theme") === "light") theme = "light";
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f1f1f3" : "#19191c");
})();
