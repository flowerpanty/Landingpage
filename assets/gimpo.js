(() => {
  "use strict";
  const board = document.getElementById("gimpo-flap-board");
  const flap = window.NmSplitFlap;
  if (!board || !flap) return;

  const destinations = ["JEJU", "BUSAN", "TOKYO", "OSAKA"];
  const rows = [...board.querySelectorAll(".destination-row")];
  rows.forEach((row, index) => {
    const bank = flap.createFlapBank(destinations[index], "gimpo-destination", 5);
    row.querySelector(".destination-bank").append(bank);
  });

  let shift = 0;
  document.getElementById("gimpo-board-change")?.addEventListener("click", () => {
    shift = (shift + 1) % destinations.length;
    rows.forEach((row, index) => {
      const destination = destinations[(index + shift) % destinations.length];
      row.dataset.destination = destination;
      flap.setFlapValue(row.querySelector(".flap-bank"), destination, { animate: true, rowDelay: index * 80 });
    });
  });
})();
