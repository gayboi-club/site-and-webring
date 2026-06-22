document.addEventListener("DOMContentLoaded", () => {

  const statusEl = document.querySelector(".status");
  if (statusEl) {
    const statuses = ["Online (probably)", "Meowing", "Learning Rust :3c"];
    setInterval(() => {
      const next = statuses[Math.floor(Math.random() * statuses.length)];
      statusEl.textContent = next;
    }, 8000);
  }

});
