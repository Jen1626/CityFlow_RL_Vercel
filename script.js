(() => {
    "use strict";

    /* =========================================================
       CITYFLOW - FIXED TRAFFIC ENGINE

       FIXES:
       1. Cars never rotate upside down.
       2. Cars have a real safety gap.
       3. Cars stop before the stop line.
       4. No perpendicular traffic enters during another axis' green.
       5. Yellow waits for the intersection to clear.
       6. Emergency mode freezes normal traffic.
       7. Emergency vehicle does not overlap the car immediately ahead.
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
       SETTINGS
    ========================================================= */

    const CAR_W = 42;
    const CAR_H = 32;

    /* Actual empty space between car bodies. */
    const SAFETY_GAP = 28;

    const SPEED = 88;

    const MAX_CARS = 20;

    const GREEN_TIME = 8;
    const YELLOW_TIME = 2;
    const MAX_YELLOW_CLEARANCE = 4;

    const EMERGENCY_DURATION = 7;

    /* =========================================================
       STATE
    ========================================================= */

    let cars = [];
    let nextId = 1;

    let selected = "NS";
    let phase = "GREEN";
    let timer = GREEN_TIME;

    let yellowElapsed = 0;

    let throughput = 0;

    let emergency = false;
    let emergencyEnd = 0;
    let emergencyTop = 0;

    let lastTime = performance.now();
    let spawnClock = 0;

    /* =========================================================
       DIMENSIONS
    ========================================================= */

    function dims() {
        return {
            w: intersection ? intersection.clientWidth : 800,
            h: intersection ? intersection.clientHeight : 610
        };
    }

    /* =========================================================
       LANE CENTERS

       N = left lane of vertical road
       S = right lane of vertical road

       W = upper lane of horizontal road
       E = lower lane of horizontal road
    ========================================================= */

    function laneCenterX(entry) {
        const { w } = dims();

        if (entry === "N") return w * 0.455;
        if (entry === "S") return w * 0.545;

        return w * 0.5;
    }

    function laneCenterY(entry) {
        const { h } = dims();

        if (entry === "W") return h * 0.455;
        if (entry === "E") return h * 0.545;

        return h * 0.5;
    }

    /* =========================================================
       CAR VISUAL

       IMPORTANT:
       We deliberately DO NOT rotate the emoji.

       This is the root of the upside-down problem in the old
       code: script.js was directly setting rotate(180deg),
       rotate(90deg), and rotate(-90deg).
    ========================================================= */

    function setCarDirection(car) {
        const emoji = car.el.querySelector(".car-emoji");

        if (!emoji) return;

        emoji.style.transform = "none";
        emoji.style.rotate = "none";
    }

    /* =========================================================
       CREATE CAR
    ========================================================= */

    function createCar(entry, distanceFromEntry = 0) {
        if (!intersection || !layer) return;
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

        if (entry === "N") {
            car.x = laneCenterX("N") - CAR_W / 2;
            car.y = -CAR_H - distanceFromEntry;
        }

        if (entry === "S") {
            car.x = laneCenterX("S") - CAR_W / 2;
            car.y = h + distanceFromEntry;
        }

        if (entry === "W") {
            car.x = -CAR_W - distanceFromEntry;
            car.y = laneCenterY("W") - CAR_H / 2;
        }

        if (entry === "E") {
            car.x = w + distanceFromEntry;
            car.y = laneCenterY("E") - CAR_H / 2;
        }

        car.el.className = "traffic-car";
        car.el.innerHTML = '<span class="car-emoji">🚗</span>';

        car.el.classList.add("car-" + entry.toLowerCase());

        layer.appendChild(car.el);
        cars.push(car);

        setCarDirection(car);
        render(car);
    }

    /* =========================================================
       RENDER
    ========================================================= */

    function render(car) {
        car.el.style.left = Math.round(car.x) + "px";
        car.el.style.top = Math.round(car.y) + "px";
    }

    /* =========================================================
       PROGRESS

       Progress always increases in the actual travel direction.
    ========================================================= */

    function progress(car) {
        if (car.entry === "N") return car.y;
        if (car.entry === "S") return -car.y;
        if (car.entry === "W") return car.x;
        return -car.x;
    }

    /* =========================================================
       FRONT CAR
    ========================================================= */

    function leaderOf(car) {
        let leader = null;
        let best = Infinity;

        for (const other of cars) {
            if (other === car) continue;
            if (other.entry !== car.entry) continue;

            const d = progress(other) - progress(car);

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

        if (car.entry === "N") return h * 0.35;
        if (car.entry === "S") return h * 0.65;
        if (car.entry === "W") return w * 0.35;

        return w * 0.65;
    }

    /* =========================================================
       SAFE STOP POSITION

       This is the top/left position of the car.
    ========================================================= */

    function stopPosition(car) {
        const line = stopLine(car);

        if (car.entry === "N") {
            return line - CAR_H - 9;
        }

        if (car.entry === "S") {
            return line + 9;
        }

        if (car.entry === "W") {
            return line - CAR_W - 9;
        }

        return line + 9;
    }

    /* =========================================================
       PASSED STOP LINE
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
       CENTRAL INTERSECTION TEST

       A car is considered inside the conflict zone when its
       body overlaps the central 30% x 30% square.
    ========================================================= */

    function inIntersection(car) {
        const { w, h } = dims();

        const left = w * 0.35;
        const right = w * 0.65;
        const top = h * 0.35;
        const bottom = h * 0.65;

        const carLeft = car.x;
        const carRight = car.x + CAR_W;
        const carTop = car.y;
        const carBottom = car.y + CAR_H;

        return (
            carRight > left &&
            carLeft < right &&
            carBottom > top &&
            carTop < bottom
        );
    }

    /* =========================================================
       IS THE SELECTED AXIS CLEAR?
    ========================================================= */

    function selectedAxisClear() {
        return !cars.some(
            car =>
                car.dir === selected &&
                inIntersection(car)
        );
    }

    /* =========================================================
       CAN THIS CAR ENTER?

       Once a car is already inside the intersection it is
       allowed to clear it even during yellow.
    ========================================================= */

    function canEnter(car) {
        if (emergency) return false;

        if (passedStop(car)) {
            return true;
        }

        return selected === car.dir && phase === "GREEN";
    }

    /* =========================================================
       SAFETY GAP

       Returns the maximum movement allowed without getting
       closer than SAFETY_GAP to the leader.
    ========================================================= */

    function availableMove(car) {
        const leader = leaderOf(car);

        if (!leader) {
            return Infinity;
        }

        let gap;

        if (car.entry === "N") {
            gap = leader.y - (car.y + CAR_H);
        } else if (car.entry === "S") {
            gap = car.y - (leader.y + CAR_H);
        } else if (car.entry === "W") {
            gap = leader.x - (car.x + CAR_W);
        } else {
            gap = car.x - (leader.x + CAR_W);
        }

        return gap - SAFETY_GAP;
    }

    /* =========================================================
       UPDATE ONE CAR
    ========================================================= */

    function updateCar(car, dt) {
        if (emergency) {
            car.wait += dt / 1000;
            return;
        }

        let move = SPEED * dt / 1000;

        /* -----------------------------------------
           FOLLOWING CAR SAFETY
        ----------------------------------------- */

        const safeMove = availableMove(car);

        if (safeMove <= 0) {
            car.wait += dt / 1000;
            return;
        }

        if (safeMove !== Infinity) {
            move = Math.min(move, safeMove);
        }

        /* -----------------------------------------
           RED / YELLOW STOP
        ----------------------------------------- */

        if (!canEnter(car) && !passedStop(car)) {
            const stop = stopPosition(car);

            if (car.entry === "N") {
                const d = stop - car.y;

                if (d <= 0) {
                    car.wait += dt / 1000;
                    return;
                }

                move = Math.min(move, d);
            }

            else if (car.entry === "S") {
                const d = car.y - stop;

                if (d <= 0) {
                    car.wait += dt / 1000;
                    return;
                }

                move = Math.min(move, d);
            }

            else if (car.entry === "W") {
                const d = stop - car.x;

                if (d <= 0) {
                    car.wait += dt / 1000;
                    return;
                }

                move = Math.min(move, d);
            }

            else {
                const d = car.x - stop;

                if (d <= 0) {
                    car.wait += dt / 1000;
                    return;
                }

                move = Math.min(move, d);
            }
        }

        if (move <= 0) {
            car.wait += dt / 1000;
            return;
        }

        /* -----------------------------------------
           ACTUAL MOVEMENT

           N = DOWN
           S = UP
           W = RIGHT
           E = LEFT
        ----------------------------------------- */

        if (car.entry === "N") {
            car.y += move;
        } else if (car.entry === "S") {
            car.y -= move;
        } else if (car.entry === "W") {
            car.x += move;
        } else {
            car.x -= move;
        }

        render(car);

        /* -----------------------------------------
           REMOVE AFTER EXIT
        ----------------------------------------- */

        const { w, h } = dims();

        const outside =
            car.x < -CAR_W - 80 ||
            car.x > w + 80 ||
            car.y < -CAR_H - 80 ||
            car.y > h + 80;

        if (outside) {
            throughput++;
            car.el.remove();
            cars = cars.filter(c => c !== car);
        }
    }

    /* =========================================================
       FINAL HARD SAFETY PASS

       Even if a frame produces a rounding difference, this
       guarantees cars in the same lane can NEVER overlap.
    ========================================================= */

    function enforceLaneSpacing() {
        const directions = ["N", "S", "W", "E"];

        for (const direction of directions) {
            const lane = cars
                .filter(car => car.entry === direction)
                .sort(
                    (a, b) =>
                        progress(a) - progress(b)
                );

            /* lane is ordered from back to front */
            for (let i = 1; i < lane.length; i++) {
                const back = lane[i - 1];
                const front = lane[i];

                if (direction === "N") {
                    const minimumY =
                        back.y + CAR_H + SAFETY_GAP;

                    if (front.y < minimumY) {
                        front.y = minimumY;
                        render(front);
                    }
                }

                else if (direction === "S") {
                    const maximumY =
                        back.y - CAR_H - SAFETY_GAP;

                    if (front.y > maximumY) {
                        front.y = maximumY;
                        render(front);
                    }
                }

                else if (direction === "W") {
                    const minimumX =
                        back.x + CAR_W + SAFETY_GAP;

                    if (front.x < minimumX) {
                        front.x = minimumX;
                        render(front);
                    }
                }

                else {
                    const maximumX =
                        back.x - CAR_W - SAFETY_GAP;

                    if (front.x > maximumX) {
                        front.x = maximumX;
                        render(front);
                    }
                }
            }
        }
    }

    /* =========================================================
       SIGNAL STATE MACHINE
    ========================================================= */

    function updateSignal(dt) {
        if (emergency) return;

        timer -= dt / 1000;

        if (phase === "GREEN") {
            if (timer <= 0) {
                phase = "YELLOW";
                timer = YELLOW_TIME;
                yellowElapsed = 0;
            }

            return;
        }

        /* YELLOW */

        yellowElapsed += dt / 1000;

        if (
            timer <= 0 &&
            (
                selectedAxisClear() ||
                yellowElapsed >= MAX_YELLOW_CLEARANCE
            )
        ) {
            selected =
                selected === "NS"
                    ? "EW"
                    : "NS";

            phase = "GREEN";
            timer = GREEN_TIME;
            yellowElapsed = 0;
        } else if (timer <= 0) {
            /* Keep yellow until intersection clears. */
            timer = 0.2;
        }
    }

    /* =========================================================
       SIGNAL DISPLAY
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

                if (!red || !yellow || !green) {
                    return;
                }

                red.classList.remove("on");
                yellow.classList.remove("on");
                green.classList.remove("on");

                if (emergency) {
                    red.classList.add("on");
                    return;
                }

                if (direction !== selected) {
                    red.classList.add("on");
                    return;
                }

                if (phase === "GREEN") {
                    green.classList.add("on");
                } else {
                    yellow.classList.add("on");
                }
            });

        if (ui.dir) {
            ui.dir.textContent =
                emergency ? "ALL STOP" : selected;
        }

        if (ui.timer) {
            ui.timer.textContent =
                emergency
                    ? "STOP"
                    : Math.max(0, Math.ceil(timer));
        }

        if (ui.phase) {
            ui.phase.textContent =
                emergency
                    ? "EMERGENCY STOP"
                    : phase;
        }
    }

    /* =========================================================
       METRICS
    ========================================================= */

    function updateMetrics() {
        const ns =
            cars.filter(car => car.dir === "NS");

        const ew =
            cars.filter(car => car.dir === "EW");

        const waiting =
            cars.filter(car => car.wait > 0.2);

        function average(list) {
            if (!list.length) return 0;

            return (
                list.reduce(
                    (sum, car) =>
                        sum + car.wait,
                    0
                ) / list.length
            );
        }

        const queueScore = cars.length * 3;

        const waitingScore =
            waiting.length * 0.5;

        const congestionScore =
            Math.min(
                100,
                cars.length * 1.8 +
                waiting.length * 0.7
            );

        if (ui.ns) ui.ns.textContent = ns.length;
        if (ui.ew) ui.ew.textContent = ew.length;

        if (ui.wns) {
            ui.wns.textContent =
                average(ns).toFixed(1) + "s";
        }

        if (ui.wew) {
            ui.wew.textContent =
                average(ew).toFixed(1) + "s";
        }

        if (ui.throughput) {
            ui.throughput.textContent = throughput;
        }

        if (ui.congestion) {
            ui.congestion.textContent =
                congestionScore > 35
                    ? "HIGH"
                    : congestionScore > 18
                        ? "MEDIUM"
                        : "LOW";
        }

        if (ui.q) {
            ui.q.textContent =
                queueScore.toFixed(1);
        }

        if (ui.w) {
            ui.w.textContent =
                waitingScore.toFixed(1);
        }

        if (ui.c) {
            ui.c.textContent =
                congestionScore.toFixed(1);
        }

        if (ui.nsbar) {
            ui.nsbar.style.width =
                Math.min(
                    100,
                    ns.length / MAX_CARS * 100
                ) + "%";
        }

        if (ui.ewbar) {
            ui.ewbar.style.width =
                Math.min(
                    100,
                    ew.length / MAX_CARS * 100
                ) + "%";
        }

        if (ui.tpbar) {
            ui.tpbar.style.width =
                Math.min(100, throughput) + "%";
        }
    }

    /* =========================================================
       EMERGENCY

       Normal traffic freezes immediately.
       Emergency vehicle uses the S lane and travels UP.
       It also keeps a safety gap from the stopped car ahead.
    ========================================================= */

    function triggerEmergency() {
        if (emergency) return;

        emergency = true;
        emergencyEnd =
            performance.now() + EMERGENCY_DURATION * 1000;

        const { h } = dims();

        emergencyTop = h - 55;

        if (emergencyEl) {
            emergencyEl.hidden = false;
            emergencyEl.textContent = "🚑";

            /* CRITICAL: no rotation. */
            emergencyEl.style.transform = "none";
            emergencyEl.style.left =
                (laneCenterX("S") - 23) + "px";
            emergencyEl.style.top =
                emergencyTop + "px";
        }

        if (ui.status) {
            ui.status.innerHTML =
                'Emergency Vehicle: <strong>ACTIVE — ALL TRAFFIC STOPPED</strong>';
        }

        updateSignals();
    }

    function updateEmergency(now, dt) {
        if (!emergency || !emergencyEl) {
            return;
        }

        let move =
            110 * dt / 1000;

        /*
         * Find the nearest stopped S-lane car ahead.
         * Emergency vehicle will not overlap it.
         */
        const leaders =
            cars
                .filter(car => car.entry === "S")
                .filter(car => car.y < emergencyTop)
                .sort(
                    (a, b) =>
                        b.y - a.y
                );

        if (leaders.length) {
            const frontCar = leaders[0];

            const allowedTop =
                frontCar.y +
                CAR_H +
                SAFETY_GAP;

            const distance =
                emergencyTop -
                allowedTop;

            if (distance <= 0) {
                move = 0;
            } else {
                move = Math.min(move, distance);
            }
        }

        emergencyTop -= move;

        emergencyEl.style.top =
            Math.round(emergencyTop) + "px";

        if (now >= emergencyEnd) {
            emergency = false;
            emergencyEl.hidden = true;

            if (ui.status) {
                ui.status.innerHTML =
                    'Emergency Vehicle: <strong>NONE</strong>';
            }

            updateSignals();
        }
    }

    /* =========================================================
       EMERGENCY BUTTON
    ========================================================= */

    const emergencyBtn =
        document.getElementById("emergencyBtn");

    if (emergencyBtn) {
        emergencyBtn.addEventListener(
            "click",
            triggerEmergency
        );
    }

    /* =========================================================
       INITIAL TRAFFIC

       Cars are deliberately separated by 120px at spawn.
    ========================================================= */

    createCar("N", 0);
    createCar("N", 120);
    createCar("N", 240);

    createCar("S", 0);
    createCar("S", 120);
    createCar("S", 240);

    createCar("W", 0);
    createCar("W", 120);
    createCar("W", 240);

    createCar("E", 0);
    createCar("E", 120);
    createCar("E", 240);

    /* =========================================================
       SAFE NEW TRAFFIC SPAWN
    ========================================================= */

    function spawnTraffic() {
        if (emergency) return;
        if (cars.length >= MAX_CARS) return;

        const entries = ["N", "S", "W", "E"];

        const entry =
            entries[
                Math.floor(
                    Math.random() * entries.length
                )
            ];

        const { w, h } = dims();

        /*
         * New car only appears if the entry zone has enough
         * empty space.
         */
        const tooClose =
            cars.some(car => {
                if (car.entry !== entry) return false;

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

        if (tooClose) return;

        createCar(entry, 0);
    }

    /* =========================================================
       MAIN LOOP
    ========================================================= */

    function loop(now) {
        const dt =
            Math.min(
                40,
                Math.max(0, now - lastTime)
            );

        lastTime = now;

        /* Spawn */
        spawnClock += dt;

        if (spawnClock >= 1800) {
            spawnClock = 0;
            spawnTraffic();
        }

        /* Signal */
        updateSignal(dt);

        /* Emergency */
        updateEmergency(now, dt);

        /*
         * FRONT CAR FIRST.
         *
         * Sorting by progress descending means the car
         * nearest the exit gets updated before the follower.
         */
        const directions =
            ["N", "S", "W", "E"];

        for (const direction of directions) {
            const lane =
                cars
                    .filter(
                        car =>
                            car.entry === direction
                    )
                    .sort(
                        (a, b) =>
                            progress(b) -
                            progress(a)
                    );

            for (const car of lane) {
                if (cars.includes(car)) {
                    updateCar(car, dt);
                }
            }
        }

        /*
         * FINAL COLLISION-SAFETY PASS.
         */
        enforceLaneSpacing();

        updateSignals();
        updateMetrics();

        requestAnimationFrame(loop);
    }

    /* =========================================================
       START
    ========================================================= */

    updateSignals();
    updateMetrics();

    requestAnimationFrame(loop);
})();
