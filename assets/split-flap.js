(() => {
  "use strict";

  const ALPHABET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/-.";
  const STEP_MS = 70;
  const STEP_INTERVAL_MS = 80;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STORAGE_KEY = "gimpoBoardSound";
  let soundEnabled = false;
  let audioContext = null;
  let lastTickAt = 0;

  try { soundEnabled = localStorage.getItem(STORAGE_KEY) === "on"; } catch { /* storage may be disabled */ }

  function normalise(value) {
    return [...String(value ?? "—").toUpperCase()].map((char) => ALPHABET.includes(char) ? char : "-").join("") || "-";
  }

  function half(className, char) {
    const face = document.createElement("span");
    face.className = className;
    const glyph = document.createElement("span");
    glyph.className = "flap-glyph";
    glyph.textContent = char === " " ? "\u00a0" : char;
    face.append(glyph);
    return face;
  }

  function writeFace(face, char) {
    face.firstElementChild.textContent = char === " " ? "\u00a0" : char;
  }

  function settle(slot, char) {
    slot.classList.remove("is-flipping");
    slot.dataset.char = char;
    [...slot.children].slice(0, 4).forEach((face) => writeFace(face, char));
  }

  function createSlot(char) {
    const slot = document.createElement("span");
    slot.className = "flap-slot";
    slot.setAttribute("aria-hidden", "true");
    slot.dataset.char = char;
    slot._timers = [];
    slot.append(
      half("flap-static-top", char), half("flap-static-bottom", char),
      half("flap-flip-top", char), half("flap-flip-bottom", char)
    );
    const hinge = document.createElement("span");
    hinge.className = "flap-hinge";
    slot.append(hinge);
    return slot;
  }

  function createFlapBank(value, className = "", fixedWidth = 0) {
    const bank = document.createElement("span");
    bank.className = `flap-bank ${className}`.trim();
    bank.setAttribute("role", "img");
    const text = normalise(value);
    const width = Number.isInteger(fixedWidth) && fixedWidth > 0 ? fixedWidth : 0;
    if (width) bank.dataset.fixedWidth = String(width);
    bank.setAttribute("aria-label", text);
    bank.dataset.value = text;
    bank.replaceChildren(...[...(width ? text.slice(0, width).padEnd(width, " ") : text)].map(createSlot));
    return bank;
  }

  function cancelSlot(slot) {
    slot._timers.forEach(clearTimeout);
    slot._timers = [];
    settle(slot, slot.dataset.char);
  }

  function step(slot, next, onStep) {
    const current = slot.dataset.char;
    const [staticTop, staticBottom, flipTop, flipBottom] = slot.children;
    writeFace(staticTop, current);
    writeFace(staticBottom, next);
    writeFace(flipTop, current);
    writeFace(flipBottom, next);
    slot.classList.remove("is-flipping");
    // Restart both physical leaves even when this slot has flipped before.
    void slot.offsetWidth;
    slot.classList.add("is-flipping");
    onStep?.();
    slot._timers.push(setTimeout(() => writeFace(staticTop, next), STEP_MS / 2));
    slot._timers.push(setTimeout(() => settle(slot, next), STEP_MS));
  }

  function sequence(from, to) {
    const oldIndex = ALPHABET.indexOf(from);
    const newIndex = ALPHABET.indexOf(to);
    const distance = (newIndex - oldIndex + ALPHABET.length) % ALPHABET.length;
    if (distance <= 1) return [to];
    const intermediateCount = Math.min(2, distance - 1);
    return [...Array.from({ length: intermediateCount }, (_, index) =>
      ALPHABET[(oldIndex + index + 1) % ALPHABET.length]), to];
  }

  function setFlapValue(bank, value, { animate = true, rowDelay = 0, onStep } = {}) {
    const next = normalise(value);
    if (bank.dataset.value === next) return 0;
    const fixedWidth = Number(bank.dataset.fixedWidth) || 0;
    const visible = fixedWidth ? next.slice(0, fixedWidth).padEnd(fixedWidth, " ") : next;
    const oldLength = bank.children.length;
    const targetLength = fixedWidth || Math.max(oldLength, visible.length);
    while (bank.children.length < targetLength) bank.append(createSlot(" "));
    bank.dataset.value = next;
    bank.setAttribute("aria-label", next);
    let changed = 0;
    [...bank.children].forEach((slot, index) => {
      cancelSlot(slot);
      const target = visible[index] || " ";
      if (slot.dataset.char === target) return;
      changed += 1;
      if (!animate || REDUCED_MOTION.matches) { settle(slot, target); return; }
      sequence(slot.dataset.char, target).forEach((char, stepIndex) => {
        slot._timers.push(setTimeout(() => step(slot, char, onStep), rowDelay + (index % 5) * 30 + stepIndex * STEP_INTERVAL_MS));
      });
    });
    if (!fixedWidth && oldLength > next.length) {
      const cleanupDelay = animate && !REDUCED_MOTION.matches ? rowDelay + 5 * 30 + 3 * STEP_INTERVAL_MS : 0;
      setTimeout(() => { if (bank.dataset.value === next) while (bank.children.length > next.length) bank.lastElementChild.remove(); }, cleanupDelay);
    }
    return changed;
  }

  function activateAudio() {
    if (!soundEnabled || audioContext) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext = new Context();
    audioContext.resume().catch(() => {});
  }

  function tick() {
    if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
    const now = performance.now();
    if (now - lastTickAt < 80) return;
    lastTickAt = now;
    const duration = .035;
    const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
    const noise = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 950 + Math.random() * 250;
    gain.gain.setValueAtTime(.025 + Math.random() * .008, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    noise.buffer = buffer;
    noise.connect(filter).connect(gain).connect(audioContext.destination);
    noise.start();
    noise.stop(audioContext.currentTime + duration);
    const knock = audioContext.createOscillator();
    const knockGain = audioContext.createGain();
    knock.type = "triangle";
    knock.frequency.setValueAtTime(115 + Math.random() * 20, audioContext.currentTime);
    knockGain.gain.setValueAtTime(.012, audioContext.currentTime);
    knockGain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .045);
    knock.connect(knockGain).connect(audioContext.destination);
    knock.start();
    knock.stop(audioContext.currentTime + .045);
  }

  function bindSoundToggle(button) {
    function sync() {
      button.setAttribute("aria-pressed", String(soundEnabled));
      (button.querySelector("span") || button).textContent = `SOUND ${soundEnabled ? "ON" : "OFF"}`;
    }
    sync();
    button.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      try { localStorage.setItem(STORAGE_KEY, soundEnabled ? "on" : "off"); } catch { /* storage may be disabled */ }
      if (soundEnabled) activateAudio();
      sync();
    });
    // Restored preference stays silent until a fresh, user-initiated gesture.
    const activateOnGesture = () => { if (soundEnabled) activateAudio(); };
    window.addEventListener("pointerdown", activateOnGesture, { once: true });
    window.addEventListener("keydown", activateOnGesture, { once: true });
  }

  /* ─── Mechanical Clock ──────────────────────────────── */
  function pad2(n) { return String(n).padStart(2, "0"); }

  function initClock(hhEl, mmEl) {
    if (!hhEl || !mmEl) return;
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
    const currentTime = () => formatter.format(new Date()).split(":");
    const [hh, mm] = currentTime();

    // Fill initial characters
    hhEl.replaceChildren(...[...hh].map(createSlot));
    hhEl.dataset.value = hh;
    hhEl.setAttribute("aria-label", hh);

    mmEl.replaceChildren(...[...mm].map(createSlot));
    mmEl.dataset.value = mm;
    mmEl.setAttribute("aria-label", mm);

    function updateClock() {
      const [newHH, newMM] = currentTime();
      setFlapValue(hhEl, newHH, { animate: true, rowDelay: 0 });
      setFlapValue(mmEl, newMM, { animate: true, rowDelay: 0 });
      hhEl.closest(".board-clock")?.setAttribute("aria-label", `현재 한국 시간 ${newHH}시 ${newMM}분`);
    }
    updateClock();
    window.setInterval(updateClock, 1000);
  }

  window.NmSplitFlap = {
    createFlapBank, setFlapValue, bindSoundToggle, tick, initClock,
    getSoundState: () => ({ enabled: soundEnabled, contextCreated: Boolean(audioContext) })
  };
})();
