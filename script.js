(() => {
"use strict";

/* =========================================================
   CITYFLOW — TRAFFIC SIMULATION
========================================================= */

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


/* =========================================================
   CONFIGURATION
========================================================= */

const CAR_W = 42;
const CAR_H = 28;

const SAFETY_GAP = 32;

const SPEED = 88;

const MAX_CARS = 20;

const GREEN_TIME = 8;
const YELLOW_TIME = 2;

/*
 * Emergency duration is not used as the stopping condition.
 * The ambulance finishes only after it leaves the road.
 */
const EMERGENCY_SPEED = 165;


/* =========================================================
   STATE
========================================================= */

let cars = [];
let nextId = 1;

let selected = "NS";
let phase = "GREEN";
let timer = GREEN_TIME;

let throughput = 0;

let emergency = false;
let emergencyTop = -60;

let lastTime = performance.now();
let spawnClock = 0;


/* =========================================================
   DIMENSIONS
========================================================= */

function dims() {
  return {
    w: intersection.clientWidth,
    h: intersection.clientHeight
  };
}


/* =========================================================
   LANE POSITIONS
========================================================= */

/*
 * IMPORTANT:
 *
 * The vertical road is physically centered at 50%.
 *
 * Cars use two slightly separated lanes:
 *
 * N = northbound/southbound lane position
 * S = opposite vertical lane
 *
 * Emergency vehicle uses EXACTLY 50%.
 */

function laneCenterX(entry) {

  const { w } = dims();

  if (entry === "N") {
    return w * 0.455;
  }

  if (entry === "S") {
    return w * 0.545;
  }

  return w * 0.5;
}


function laneCenterY(entry) {

  const { h } = dims();

  if (entry === "W") {
    return h * 0.455;
  }

  if (entry === "E") {
    return h * 0.545;
  }

  return h * 0.5;
}


/* =========================================================
   CREATE NORMAL CAR
========================================================= */

function createCar(entry, offset = 0) {

  if (cars.length >= MAX_CARS) return;

  const { w, h } = dims();

  const car = {
    id: nextId++,

    entry,

    dir:
      entry === "N" || entry === "S"
        ? "NS"
        : "EW",

    x: 0,
    y: 0,

    wait: 0,

    el: document.createElement("div")
  };


  /* -------------------------
     INITIAL POSITION
  ------------------------- */

  if (entry === "N") {

    car.x = laneCenterX("N") - CAR_W / 2;

    car.y = -CAR_H - offset;
  }


  if (entry === "S") {

    car.x = laneCenterX("S") - CAR_W / 2;

    car.y = h + offset;
  }


  if (entry === "W") {

    car.x = -CAR_W - offset;

    car.y = laneCenterY("W") - CAR_H / 2;
  }


  if (entry === "E") {

    car.x = w + offset;

    car.y = laneCenterY("E") - CAR_H / 2;
  }


  /* -------------------------
     CSS CAR
  ------------------------- */

  car.el.className =
    `traffic-car car-${entry.toLowerCase()}`;


  car.el.innerHTML = `
    <div class="car-visual">

      <div class="car-body"></div>

      <div class="car-cabin">

        <span class="car-window"></span>

        <span class="car-window two"></span>

      </div>

      <span class="wheel a"></span>

      <span class="wheel b"></span>

      <span class="car-headlight"></span>

    </div>
  `;


  layer.appendChild(car.el);

  cars.push(car);

  render(car);
}


/* =========================================================
   RENDER NORMAL CAR
========================================================= */

function render(car) {

  car.el.style.left =
    Math.round(car.x) + "px";

  car.el.style.top =
    Math.round(car.y) + "px";
}


/* =========================================================
   CAR PROGRESS
========================================================= */

function progress(car) {

  if (car.entry === "N") {
    return car.y;
  }

  if (car.entry === "S") {
    return -car.y;
  }

  if (car.entry === "W") {
    return car.x;
  }

  return -car.x;
}


/* =========================================================
   FIND CAR IN FRONT
========================================================= */

function leaderOf(car) {

  let leader = null;

  let best = Infinity;

  for (const other of cars) {

    if (other === car) continue;

    if (other.entry !== car.entry) continue;

    const d =
      progress(other) -
      progress(car);

    if (d > 0 && d < best) {

      best = d;

      leader = other;
    }
  }

  return leader;
}


/* =========================================================
   STOP LINE
========================================================= */

function stopLine(car) {

  const { w, h } = dims();

  if (car.entry === "N") {
    return h * 0.35;
  }

  if (car.entry === "S") {
    return h * 0.65;
  }

  if (car.entry === "W") {
    return w * 0.35;
  }

  return w * 0.65;
}


/* =========================================================
   STOP POSITION
========================================================= */

function stopPosition(car) {

  const line = stopLine(car);

  if (car.entry === "N") {
    return line - CAR_H - 10;
  }

  if (car.entry === "S") {
    return line + 10;
  }

  if (car.entry === "W") {
    return line - CAR_W - 10;
  }

  return line + 10;
}


/* =========================================================
   HAS PASSED STOP LINE
========================================================= */

function passedStop(car) {

  const line = stopLine(car);

  if (car.entry === "N") {
    return car.y + CAR_H >= line + 2;
  }

  if (car.entry === "S") {
    return car.y <= line - 2;
  }

  if (car.entry === "W") {
    return car.x + CAR_W >= line + 2;
  }

  return car.x <= line - 2;
}


/* =========================================================
   INTERSECTION CHECK
========================================================= */

function inIntersection(car) {

  const { w, h } = dims();

  const L = w * 0.35;
  const R = w * 0.65;

  const T = h * 0.35;
  const B = h * 0.65;

  return (
    car.x + CAR_W > L &&
    car.x < R &&
    car.y + CAR_H > T &&
    car.y < B
  );
}


/* =========================================================
   CHECK WHETHER AN AXIS IS OCCUPYING JUNCTION
========================================================= */

function axisOccupied(axis) {

  return cars.some(
    car =>
      car.dir === axis &&
      inIntersection(car)
  );
}


/* =========================================================
   CAN ENTER INTERSECTION
========================================================= */

function canEnter(car) {

  /*
   * During emergency, normal cars cannot enter.
   */
  if (emergency) {
    return false;
  }


  /*
   * Already inside intersection:
   * allow the vehicle to finish.
   */
  if (passedStop(car)) {
    return true;
  }


  /*
   * Wrong direction or yellow/red.
   */
  if (
    selected !== car.dir ||
    phase !== "GREEN"
  ) {
    return false;
  }


  /*
   * Never allow perpendicular traffic
   * to enter an occupied intersection.
   */
  const otherAxis =
    car.dir === "NS"
      ? "EW"
      : "NS";


  return !axisOccupied(otherAxis);
}


/* =========================================================
   SAFETY GAP
========================================================= */

function availableMove(car) {

  const leader = leaderOf(car);

  if (!leader) {
    return Infinity;
  }


  let gap;


  if (car.entry === "N") {

    gap =
      leader.y -
      (car.y + CAR_H);
  }


  else if (car.entry === "S") {

    gap =
      car.y -
      (leader.y + CAR_H);
  }


  else if (car.entry === "W") {

    gap =
      leader.x -
      (car.x + CAR_W);
  }


  else {

    gap =
      car.x -
      (leader.x + CAR_W);
  }


  return gap - SAFETY_GAP;
}


/* =========================================================
   UPDATE NORMAL CAR
========================================================= */

function updateCar(car, dt) {

  /*
   * EMERGENCY:
   *
   * Every normal car freezes.
   */
  if (emergency) {

    car.wait += dt / 1000;

    return;
  }


  let move =
    SPEED * dt / 1000;


  /*
   * SAFETY GAP
   */

  const safe =
    availableMove(car);


  if (safe <= 0) {

    car.wait += dt / 1000;

    return;
  }


  if (safe !== Infinity) {

    move =
      Math.min(move, safe);
  }


  /*
   * SIGNAL / STOP LINE
   */

  if (
    !canEnter(car) &&
    !passedStop(car)
  ) {

    const stop =
      stopPosition(car);

    let d;


    if (car.entry === "N") {

      d = stop - car.y;
    }


    else if (car.entry === "S") {

      d = car.y - stop;
    }


    else if (car.entry === "W") {

      d = stop - car.x;
    }


    else {

      d = car.x - stop;
    }


    if (d <= 0) {

      car.wait += dt / 1000;

      return;
    }


    move =
      Math.min(move, d);
  }


  if (move <= 0) {

    car.wait += dt / 1000;

    return;
  }


  /* -------------------------
     MOVE
  ------------------------- */

  if (car.entry === "N") {

    car.y += move;
  }


  else if (car.entry === "S") {

    car.y -= move;
  }


  else if (car.entry === "W") {

    car.x += move;
  }


  else {

    car.x -= move;
  }


  render(car);


  /* -------------------------
     REMOVE OUTSIDE VEHICLES
  ------------------------- */

  const { w, h } = dims();

  const outside =
    car.x < -CAR_W - 80 ||
    car.x > w + 80 ||
    car.y < -CAR_H - 80 ||
    car.y > h + 80;


  if (outside) {

    throughput++;


    car.el.remove();


    cars =
      cars.filter(
        c => c !== car
      );
  }
}


/* =========================================================
   ENFORCE SAFETY GAP AGAIN
========================================================= */

function enforceLaneSpacing() {

  for (
    const dir of ["N", "S", "W", "E"]
  ) {

    const lane =
      cars
        .filter(
          car => car.entry === dir
        )
        .sort(
          (a, b) =>
            progress(a) -
            progress(b)
        );


    for (
      let i = 1;
      i < lane.length;
      i++
    ) {

      const back = lane[i - 1];

      const front = lane[i];


      if (dir === "N") {

        const min =
          back.y +
          CAR_H +
          SAFETY_GAP;


        if (front.y < min) {

          front.y = min;

          render(front);
        }
      }


      else if (dir === "S") {

        const max =
          back.y -
          CAR_H -
          SAFETY_GAP;


        if (front.y > max) {

          front.y = max;

          render(front);
        }
      }


      else if (dir === "W") {

        const min =
          back.x +
          CAR_W +
          SAFETY_GAP;


        if (front.x < min) {

          front.x = min;

          render(front);
        }
      }


      else {

        const max =
          back.x -
          CAR_W -
          SAFETY_GAP;


        if (front.x > max) {

          front.x = max;

          render(front);
        }
      }
    }
  }
}


/* =========================================================
   SIGNAL CONTROLLER
========================================================= */

function updateSignal(dt) {

  /*
   * Emergency controls signals.
   */
  if (emergency) {
    return;
  }


  timer -=
    dt / 1000;


  /* -------------------------
     GREEN
  ------------------------- */

  if (phase === "GREEN") {

    if (timer <= 0) {

      phase = "YELLOW";

      timer = YELLOW_TIME;
    }


    return;
  }


  /* -------------------------
     YELLOW
  ------------------------- */

  if (
    timer <= 0 &&
    !axisOccupied(selected)
  ) {

    selected =
      selected === "NS"
        ? "EW"
        : "NS";


    phase = "GREEN";

    timer = GREEN_TIME;
  }

  else if (timer <= 0) {

    /*
     * Give vehicles already
     * inside the intersection time
     * to clear.
     */
    timer = 0.2;
  }
}


/* =========================================================
   UPDATE VISUAL SIGNALS
========================================================= */

function updateSignals() {

  document
    .querySelectorAll(".signal")
    .forEach(signal => {

      const direction =
        signal.dataset.direction;


      const red =
        signal.querySelector(".red");

      const yellow =
        signal.querySelector(".yellow");

      const green =
        signal.querySelector(".green");


      red.classList.remove("on");

      yellow.classList.remove("on");

      green.classList.remove("on");


      /*
       * EMERGENCY:
       *
       * ALL RED.
       */
      if (emergency) {

        red.classList.add("on");

        return;
      }


      /*
       * Other direction is RED.
       */
      if (
        direction !== selected
      ) {

        red.classList.add("on");

        return;
      }


      /*
       * Active direction.
       */
      if (phase === "GREEN") {

        green.classList.add("on");
      }

      else {

        yellow.classList.add("on");
      }
    });


  ui.dir.textContent =
    emergency
      ? "ALL STOP"
      : selected;


  ui.timer.textContent =
    emergency
      ? "STOP"
      : Math.max(
          0,
          Math.ceil(timer)
        );


  ui.phase.textContent =
    emergency
      ? "EMERGENCY STOP"
      : phase;
}


/* =========================================================
   METRICS
========================================================= */

function updateMetrics() {

  const ns =
    cars.filter(
      car => car.dir === "NS"
    );


  const ew =
    cars.filter(
      car => car.dir === "EW"
    );


  const waiting =
    cars.filter(
      car => car.wait > 0.2
    );


  function avg(list) {

    if (!list.length) {
      return 0;
    }


    return (
      list.reduce(
        (sum, car) =>
          sum + car.wait,
        0
      ) /
      list.length
    );
  }


  const q =
    cars.length * 3;


  const w =
    waiting.length * 0.5;


  const c =
    Math.min(
      100,
      cars.length * 1.8 +
      waiting.length * 0.7
    );


  ui.ns.textContent =
    ns.length;


  ui.ew.textContent =
    ew.length;


  ui.wns.textContent =
    avg(ns).toFixed(1) + "s";


  ui.wew.textContent =
    avg(ew).toFixed(1) + "s";


  ui.throughput.textContent =
    throughput;


  ui.congestion.textContent =
    c > 35
      ? "HIGH"
      : c > 18
        ? "MEDIUM"
        : "LOW";


  ui.q.textContent =
    q.toFixed(1);


  ui.w.textContent =
    w.toFixed(1);


  ui.c.textContent =
    c.toFixed(1);


  ui.nsbar.style.width =
    Math.min(
      100,
      ns.length /
      MAX_CARS *
      100
    ) + "%";


  ui.ewbar.style.width =
    Math.min(
      100,
      ew.length /
      MAX_CARS *
      100
    ) + "%";


  ui.tpbar.style.width =
    Math.min(
      100,
      throughput
    ) + "%";
}


/* =========================================================
   🚑 EMERGENCY VEHICLE
========================================================= */

function triggerEmergency() {

  /*
   * Prevent multiple emergency vehicles.
   */
  if (emergency) {
    return;
  }


  emergency = true;


  /*
   * Start ABOVE the intersection.
   */
  emergencyTop = -60;


  /*
   * Show ambulance.
   */
  emergencyEl.hidden = false;


  /*
   * IMPORTANT:
   *
   * Use the EXACT CENTER of the vertical road.
   *
   * Do NOT use laneCenterX("N") here.
   *
   * Normal cars use separate lanes.
   * Emergency vehicle gets the priority center lane.
   */
  const { w } = dims();


  emergencyEl.style.left =
    Math.round(
      w * 0.5 - 23
    ) + "px";


  emergencyEl.style.top =
    Math.round(
      emergencyTop
    ) + "px";


  /*
   * Status.
   */
  ui.status.innerHTML =
    "Emergency Vehicle: " +
    "<strong>ACTIVE — PRIORITY CROSSING</strong>";


  /*
   * Immediately make ALL signals RED.
   */
  updateSignals();
}


/* =========================================================
   🚑 EMERGENCY MOVEMENT
========================================================= */

function updateEmergency(now, dt) {

  if (!emergency) {
    return;
  }


  const { w, h } =
    dims();


  /*
   * Emergency vehicle NEVER waits
   * for a traffic signal.
   *
   * It travels straight through:
   *
   * NORTH
   *   ↓
   *   ↓
   * INTERSECTION
   *   ↓
   *   ↓
   * SOUTH
   */
  emergencyTop +=
    EMERGENCY_SPEED *
    dt /
    1000;


  /*
   * Keep it exactly centered
   * in the vertical road.
   */
  emergencyEl.style.left =
    Math.round(
      w * 0.5 - 23
    ) + "px";


  emergencyEl.style.top =
    Math.round(
      emergencyTop
    ) + "px";


  /*
   * IMPORTANT:
   *
   * Do not stop it at the white line.
   *
   * It continues until it has
   * completely exited the bottom.
   */
  if (
    emergencyTop >
    h + 70
  ) {

    emergency = false;


    emergencyEl.hidden = true;


    ui.status.innerHTML =
      "Emergency Vehicle: " +
      "<strong>NONE</strong>";


    /*
     * Restart normal traffic control.
     */
    selected =
      selected === "NS"
        ? "EW"
        : "NS";


    phase = "GREEN";


    timer =
      GREEN_TIME;


    updateSignals();
  }
}


/* =========================================================
   EMERGENCY BUTTON
========================================================= */

document
  .getElementById("emergencyBtn")
  .addEventListener(
    "click",
    triggerEmergency
  );


/* =========================================================
   INITIAL TRAFFIC
========================================================= */

/*
 * Two cars per direction.
 *
 * They start with enough separation.
 */

createCar("N", 0);
createCar("N", 100);

createCar("S", 0);
createCar("S", 100);

createCar("W", 0);
createCar("W", 100);

createCar("E", 0);
createCar("E", 100);


/* =========================================================
   NORMAL TRAFFIC SPAWNING
========================================================= */

function spawnTraffic() {

  /*
   * Don't spawn traffic during emergency.
   */
  if (emergency) {
    return;
  }


  if (
    cars.length >=
    MAX_CARS
  ) {
    return;
  }


  const entries =
    ["N", "S", "W", "E"];


  const entry =
    entries[
      Math.floor(
        Math.random() *
        entries.length
      )
    ];


  const { w, h } =
    dims();


  /*
   * Prevent spawning directly
   * on top of another car.
   */
  const tooClose =
    cars.some(car => {

      if (
        car.entry !== entry
      ) {
        return false;
      }


      if (entry === "N") {
        return car.y < 150;
      }


      if (entry === "S") {
        return car.y > h - 150;
      }


      if (entry === "W") {
        return car.x < 150;
      }


      return car.x > w - 150;
    });


  if (!tooClose) {

    createCar(
      entry,
      0
    );
  }
}


/* =========================================================
   MAIN LOOP
========================================================= */

function loop(now) {

  const dt =
    Math.min(
      40,
      Math.max(
        0,
        now - lastTime
      )
    );


  lastTime = now;


  spawnClock += dt;


  /*
   * New traffic approximately
   * every 1.8 seconds.
   */
  if (
    spawnClock >= 1800
  ) {

    spawnClock = 0;

    spawnTraffic();
  }


  /*
   * Signal controller.
   */
  updateSignal(dt);


  /*
   * Emergency vehicle.
   *
   * This runs independently of
   * normal traffic.
   */
  updateEmergency(
    now,
    dt
  );


  /*
   * Normal cars.
   *
   * updateCar() automatically
   * freezes every normal car
   * while emergency === true.
   */
  for (
    const dir of
    ["N", "S", "W", "E"]
  ) {

    const lane =
      cars
        .filter(
          car =>
            car.entry === dir
        )
        .sort(
          (a, b) =>
            progress(b) -
            progress(a)
        );


    for (
      const car of lane
    ) {

      if (
        cars.includes(car)
      ) {

        updateCar(
          car,
          dt
        );
      }
    }
  }


  /*
   * Final safety-gap enforcement.
   */
  enforceLaneSpacing();


  /*
   * Update UI.
   */
  updateSignals();

  updateMetrics();


  requestAnimationFrame(
    loop
  );
}


/* =========================================================
   START
========================================================= */

updateSignals();

updateMetrics();

requestAnimationFrame(
  loop
);

})();
