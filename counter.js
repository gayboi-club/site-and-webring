(function () {
  const ANNIVERSARY = new Date('2025-10-12T00:00:00');

  function update() {
    const now = new Date();
    const diff = now - ANNIVERSARY;
    const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    const daysEl = document.getElementById('counter-days');
    if (daysEl) {
      daysEl.textContent = `${totalDays} days`;
    }
  }

  update();
})();

