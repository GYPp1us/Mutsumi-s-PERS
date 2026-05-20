export function initTheme() {
  const saved = localStorage.getItem("mutsumi-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}
