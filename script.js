(() => {
"use strict";

/* CITYFLOW - FIXED TRAFFIC SIMULATION
   Cars are spawned visibly, approach the stop line on red/yellow,
   stop before it, and maintain a hard safety gap from the vehicle ahead.
*/

const intersection = document.getElementById("intersection");
const layer = document.getElementById("cars");
const emergencyEl = document.getElementById("emergencyCar");

const ui = {
  ns: document.getElementById("vehiclesNS"),
  ew: document.getElementById("vehiclesEW"),
  wns: document.getElementById("avgWaitNS"),
  wew: document.getElementById("avgWaitEW"),
  throughput: document.getElementById("throughput"),
  congestion: document.getElementById("congestion"),
  q: document.getElementById("queueScore"),
  w: document.getElementById("waitingScore"),
  c: document.getElementById("congestionScore"),
  dir: document.getElementById("selectedDirection"),
  timer: document.getElementById("signalTimer"),
  phase: document.getElementById("currentPhase"),
  status: document.getElementById("emergencyStatus"),
  nsbar: document.getElementById("nsBar"),
  ewbar: document.getElementById("ewBar"),
  tpbar: document.getElementById("throughputBar")
};

const CAR_W = 38;
const CAR_H = 24;
const SAFETY_GAP = 32;
const SPEED = 0.11;
const MAX_CARS = 24;

let cars = [];
let nextId = 1;
let selected = "NS";
let phase = "GREEN";
let timer = 8;
let throughput = 0;
let emergency = false;
let emergencyEnd = 0;
let last = performance.now();
let spawnClock = 0;

function dims() {
  return { w: intersection.clientWidth, h: intersection.clientHeight };
}

function createCar(entry, offset = 0) {
  if (cars.length >= MAX_CARS) return;

  const { w, h } = dims();
  const c = {
    id: nextId++,
    entry,
    dir: (entry === "N" || entry === "S") ? "NS" : "EW",
    x: 0,
    y: 0,
    wait: 0,
    el: document.createElement("div")
  };

  /* Start inside the visible approach lane, not outside the screen. */
  if (entry === "N") {
    c.x = w * 0.455 - CAR_W / 2;
    c.y = 55 + offset;
  }
  if (entry === "S") {
    c.x = w * 0.545 - CAR_W / 2;
    c.y = h - 55 - CAR_H - offset;
  }
  if (entry === "W") {
    c.x = 55 + offset;
    c.y = h * 0.455 - CAR_H / 2;
  }
  if (entry === "E") {
    c.x = w - 55 - CAR_W - offset;
    c.y = h * 0.545 - CAR_H / 2;
  }

  c.el.className = "traffic-car";
  c.el.innerHTML =
    '<div class="car-body"><div class="car-window"></div></div>';

  layer.appendChild(c.el);
  cars.push(c);
  render(c);
}

function render(c) {
  c.el.style.left = Math.round(c.x) + "px";
  c.el.style.top = Math.round(c.y) + "px";
}

function progress(c) {
  if (c.entry === "N") return c.y;
  if (c.entry === "S") return -c.y;
  if (c.entry === "W") return c.x;
  return -c.x;
}

function leaderOf(c) {
  let leader = null;
  let best = Infinity;

  for (const other of cars) {
    if (other === c || other.entry !== c.entry) continue;

    const d = progress(other) - progress(c);
    if (d > 0 && d < best) {
      best = d;
      leader = other;
    }
  }
  return leader;
}

function stopCoordinate(c) {
  const { w, h } = dims();

  if (c.entry === "N") return h * 0.34 - CAR_H - 5;
  if (c.entry === "S") return h * 0.65 + 5;
  if (c.entry === "W") return w * 0.34 - CAR_W - 5;
  return w * 0.65 + 5;
}

function hasPassedStop(c) {
  const { w, h } = dims();

  if (c.entry === "N") return c.y >= h * 0.34;
  if (c.entry === "S") return c.y <= h * 0.65 - CAR_H;
  if (c.entry === "W") return c.x >= w * 0.34;
  return c.x <= w * 0.65 - CAR_W;
}

function greenFor(c) {
  return !emergency && selected === c.dir && phase === "GREEN";
}

function updateCar(c, dt) {
  /* Emergency mode: absolutely freeze every normal car. */
  if (emergency) {
    c.wait += dt / 1000;
    return;
  }

  let move = SPEED * dt;

  /* First safety rule: never enter the leader's physical space. */
  const leader = leaderOf(c);

  if (leader) {
    let gap;

    if (c.entry === "N") gap = leader.y - (c.y + CAR_H);
    else if (c.entry === "S") gap = c.y - (leader.y + CAR_H);
    else if (c.entry === "W") gap = leader.x - (c.x + CAR_W);
    else gap = c.x - (leader.x + CAR_W);

    if (gap <= SAFETY_GAP) {
      c.wait += dt / 1000;
      return;
    }

    move = Math.min(move, Math.max(0, gap - SAFETY_GAP));
  }

  /* Second safety rule: red/yellow cars move toward the stop line,
     but never cross it. */
  if (!greenFor(c) && !hasPassedStop(c)) {
    const stop = stopCoordinate(c);

    if (c.entry === "N") {
      const d = stop - c.y;
      if (d <= 0) {
        c.wait += dt / 1000;
        return;
      }
      move = Math.min(move, d);
    }

    if (c.entry === "S") {
      const d = c.y - stop;
      if (d <= 0) {
        c.wait += dt / 1000;
        return;
      }
      move = Math.min(move, d);
    }

    if (c.entry === "W") {
      const d = stop - c.x;
      if (d <= 0) {
        c.wait += dt / 1000;
        return;
      }
      move = Math.min(move, d);
    }

    if (c.entry === "E") {
      const d = c.x - stop;
      if (d <= 0) {
        c.wait += dt / 1000;
        return;
      }
      move = Math.min(move, d);
    }
  }

  if (move <= 0.05) {
    c.wait += dt / 1000;
    return;
  }

  if (c.entry === "N") c.y += move;
  if (c.entry === "S") c.y -= move;
  if (c.entry === "W") c.x += move;
  if (c.entry === "E") c.x -= move;

  render(c);

  const { w, h } = dims();

  if (
    c.x < -CAR_W - 60 ||
    c.x > w + 60 ||
    c.y < -CAR_H - 60 ||
    c.y > h + 60
  ) {
    throughput++;
    c.el.remove();
    cars = cars.filter(x => x !== c);
  }
}

function updateSignal(dt) {
  if (emergency) return;

  timer -= dt / 1000;

  if (timer > 0) return;

  if (phase === "GREEN") {
    phase = "YELLOW";
    timer = 2;
  } else {
    selected = selected === "NS" ? "EW" : "NS";
    phase = "GREEN";
    timer = 8;
  }
}

function updateSignals() {
  document.querySelectorAll(".signal").forEach(signal => {
    const active = signal.dataset.direction === selected && !emergency;

    signal.querySelector(".red").classList.toggle(
      "on", !active || phase === "RED"
    );
    signal.querySelector(".yellow").classList.toggle(
      "on", active && phase === "YELLOW"
    );
    signal.querySelector(".green").classList.toggle(
      "on", active && phase === "GREEN"
    );
  });

  ui.dir.textContent = emergency ? "ALL STOP" : selected;
  ui.timer.textContent = Math.max(0, Math.ceil(timer));
  ui.phase.textContent = emergency ? "EMERGENCY STOP" : phase;
}

function updateMetrics() {
  const ns = cars.filter(c => c.dir === "NS");
  const ew = cars.filter(c => c.dir === "EW");
  const waiting = cars.filter(c => c.wait > 0.2).length;

  const average = list =>
    list.length
      ? list.reduce((sum, c) => sum + c.wait, 0) / list.length
      : 0;

  const queueScore = cars.length * 3;
  const waitingScore = waiting * 0.5;
  const congestionScore =
    Math.min(100, cars.length * 1.8 + waiting * 0.7);

  ui.ns.textContent = ns.length;
  ui.ew.textContent = ew.length;
  ui.wns.textContent = average(ns).toFixed(1) + "s";
  ui.wew.textContent = average(ew).toFixed(1) + "s";
  ui.throughput.textContent = throughput;

  ui.congestion.textContent =
    congestionScore > 35
      ? "HIGH"
      : congestionScore > 18
      ? "MEDIUM"
      : "LOW";

  ui.q.textContent = queueScore.toFixed(1);
  ui.w.textContent = waitingScore.toFixed(1);
  ui.c.textContent = congestionScore.toFixed(1);

  ui.nsbar.style.width =
    Math.min(100, ns.length / MAX_CARS * 100) + "%";
  ui.ewbar.style.width =
    Math.min(100, ew.length / MAX_CARS * 100) + "%";
  ui.tpbar.style.width =
    (throughput % 101) + "%";
}

function triggerEmergency() {
  if (emergency) return;

  emergency = true;
  emergencyEnd = performance.now() + 7000;

  const { w, h } = dims();

  emergencyEl.hidden = false;
  emergencyEl.style.left = (w / 2 - 16) + "px";
  emergencyEl.style.top = (h - 48) + "px";

  ui.status.innerHTML =
    "Emergency Vehicle: <strong>ACTIVE — ALL NORMAL TRAFFIC STOPPED</strong>";

  updateSignals();
}

function updateEmergency(now) {
  if (!emergency) return;

  const current =
    parseFloat(emergencyEl.style.top || "0");

  emergencyEl.style.top =
    (current - 1.5) + "px";

  if (now >= emergencyEnd) {
    emergency = false;
    emergencyEl.hidden = true;

    ui.status.innerHTML =
      "Emergency Vehicle: <strong>NONE</strong>";

    updateSignals();
  }
}

document
  .getElementById("emergencyBtn")
  .addEventListener("click", triggerEmergency);

/* Visible traffic immediately after loading. */
createCar("N", 0);
createCar("N", 70);
createCar("N", 140);

createCar("S", 0);
createCar("S", 70);
createCar("S", 140);

createCar("W", 0);
createCar("W", 70);
createCar("W", 140);

createCar("E", 0);
createCar("E", 70);
createCar("E", 140);

function loop(now) {
  const dt = Math.min(40, now - last);
  last = now;

  spawnClock += dt;

  if (spawnClock >= 1400 && !emergency) {
    spawnClock = 0;

    const entries = ["N", "S", "W", "E"];
    const entry =
      entries[Math.floor(Math.random() * entries.length)];

    createCar(entry, 0);
  }

  updateSignal(dt);
  updateEmergency(now);

  /*
    Process each lane independently.
    The leader is always evaluated before its follower.
  */
  ["N", "S", "W", "E"].forEach(entry => {
    const lane = cars
      .filter(c => c.entry === entry)
      .sort((a, b) => progress(b) - progress(a));

    lane.forEach(c => {
      if (cars.includes(c)) updateCar(c, dt);
    });
  });

  updateSignals();
  updateMetrics();

  requestAnimationFrame(loop);
}

updateSignals();
updateMetrics();
requestAnimationFrame(loop);

})();