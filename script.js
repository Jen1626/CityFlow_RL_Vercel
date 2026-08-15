(() => {
    "use strict";

    /* =========================================================
       CITYFLOW - TRAFFIC SIMULATION
    ========================================================= */

    const intersection = document.getElementById("intersection");
    const layer = document.getElementById("cars");
    const emergencyEl = document.getElementById("emergencyCar");

    /* =========================================================
       UI
    ========================================================= */

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

    // Distance between cars.
    const SAFETY_GAP = 32;

    // Pixels per second.
    const SPEED = 90;

    const MAX_CARS = 20;

    const GREEN_TIME = 8;
    const YELLOW_TIME = 2;

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
    let emergencyEnd = 0;

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
       ROAD / LANE POSITIONS
    ========================================================= */

    /*
        Vertical road:
        
        N lane = left side
        S lane = right side
    */

    function laneCenterX(entry) {
        const { w } = dims();

        if (entry === "N") {
            return w * 0.455;
        }

        if (entry === "S") {
            return w * 0.545;
        }

        return w / 2;
    }

    /*
        Horizontal road:

        W lane = upper side
        E lane = lower side
    */

    function laneCenterY(entry) {
        const { h } = dims();

        if (entry === "W") {
            return h * 0.455;
        }

        if (entry === "E") {
            return h * 0.545;
        }

        return h / 2;
    }

    /* =========================================================
       CAR ORIENTATION
    ========================================================= */

    function setCarDirection(car) {

        const emoji = car.el.querySelector(".car-emoji");

        if (!emoji) {
            return;
        }

        /*
            🚗 naturally faces RIGHT.

            W = RIGHT      0°
            E = LEFT     180°
            N = DOWN       90°
            S = UP       -90°
        */

        if (car.entry === "W") {
            emoji.style.transform = "rotate(0deg)";
        }

        if (car.entry === "E") {
            emoji.style.transform = "rotate(180deg)";
        }

        if (car.entry === "N") {
            emoji.style.transform = "rotate(90deg)";
        }

        if (car.entry === "S") {
            emoji.style.transform = "rotate(-90deg)";
        }
    }

    /* =========================================================
       CREATE CAR
    ========================================================= */

    function createCar(entry, offset = 0) {

        if (!layer || !intersection) {
            return;
        }

        if (cars.length >= MAX_CARS) {
            return;
        }

        const { w, h } = dims();

        const car = {
            id: nextId++,

            entry: entry,

            dir:
                entry === "N" || entry === "S"
                    ? "NS"
                    : "EW",

            x: 0,
            y: 0,

            wait: 0,

            el: document.createElement("div")
        };

        /* =====================================================
           START POSITIONS
        ===================================================== */

        /*
            N:
            enters from TOP
            moves DOWN
        */

        if (entry === "N") {

            car.x =
                laneCenterX("N") -
                CAR_W / 2;

            car.y =
                -CAR_H -
                offset;
        }

        /*
            S:
            enters from BOTTOM
            moves UP
        */

        if (entry === "S") {

            car.x =
                laneCenterX("S") -
                CAR_W / 2;

            car.y =
                h +
                offset;
        }

        /*
            W:
            enters from LEFT
            moves RIGHT
        */

        if (entry === "W") {

            car.x =
                -CAR_W -
                offset;

            car.y =
                laneCenterY("W") -
                CAR_H / 2;
        }

        /*
            E:
            enters from RIGHT
            moves LEFT
        */

        if (entry === "E") {

            car.x =
                w +
                offset;

            car.y =
                laneCenterY("E") -
                CAR_H / 2;
        }

        /* =====================================================
           ELEMENT
        ===================================================== */

        car.el.className = "traffic-car";

        car.el.innerHTML =
            '<span class="car-emoji">🚗</span>';

        car.el.classList.add(
            "car-" + entry.toLowerCase()
        );

        layer.appendChild(car.el);

        cars.push(car);

        setCarDirection(car);

        render(car);
    }

    /* =========================================================
       RENDER
    ========================================================= */

    function render(car) {

        car.el.style.left =
            Math.round(car.x) + "px";

        car.el.style.top =
            Math.round(car.y) + "px";
    }

    /* =========================================================
       PROGRESS
       
       IMPORTANT:
       Progress always increases in the actual direction
       of travel.
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

        // E
        return -car.x;
    }

    /* =========================================================
       FIND CAR IN FRONT
    ========================================================= */

    function leaderOf(car) {

        let leader = null;
        let nearestDistance = Infinity;

        for (const other of cars) {

            if (other === car) {
                continue;
            }

            if (other.entry !== car.entry) {
                continue;
            }

            const distance =
                progress(other) -
                progress(car);

            if (
                distance > 0 &&
                distance < nearestDistance
            ) {

                nearestDistance = distance;
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

        // E
        return w * 0.65;
    }

    /* =========================================================
       STOP POSITION
       
       This is the TOP/LEFT coordinate of the car.

       The FRONT of the car stays before the white line.
    ========================================================= */

    function stopPosition(car) {

        const line = stopLine(car);

        /*
            N moves DOWN.
            Front = y + CAR_H.
        */

        if (car.entry === "N") {
            return line - CAR_H - 10;
        }

        /*
            S moves UP.
            Front = y.
        */

        if (car.entry === "S") {
            return line + 10;
        }

        /*
            W moves RIGHT.
            Front = x + CAR_W.
        */

        if (car.entry === "W") {
            return line - CAR_W - 10;
        }

        /*
            E moves LEFT.
            Front = x.
        */

        return line + 10;
    }

    /* =========================================================
       PASSED STOP LINE
    ========================================================= */

    function passedStop(car) {

        const line = stopLine(car);

        if (car.entry === "N") {

            return (
                car.y + CAR_H >= line + 2
            );
        }

        if (car.entry === "S") {

            return (
                car.y <= line - 2
            );
        }

        if (car.entry === "W") {

            return (
                car.x + CAR_W >= line + 2
            );
        }

        // E

        return (
            car.x <= line - 2
        );
    }

    /* =========================================================
       SIGNAL CHECK
    ========================================================= */

    function canGo(car) {

        if (emergency) {
            return false;
        }

        return (
            selected === car.dir &&
            phase === "GREEN"
        );
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

        /*
            N: both cars move DOWN.
        */

        if (car.entry === "N") {

            gap =
                leader.y -
                (car.y + CAR_H);
        }

        /*
            S: both cars move UP.
        */

        else if (car.entry === "S") {

            gap =
                car.y -
                (leader.y + CAR_H);
        }

        /*
            W: both cars move RIGHT.
        */

        else if (car.entry === "W") {

            gap =
                leader.x -
                (car.x + CAR_W);
        }

        /*
            E: both cars move LEFT.
        */

        else {

            gap =
                car.x -
                (leader.x + CAR_W);
        }

        return gap - SAFETY_GAP;
    }

    /* =========================================================
       UPDATE CAR
    ========================================================= */

    function updateCar(car, dt) {

        /*
            EMERGENCY:
            ALL NORMAL CARS STOP.
        */

        if (emergency) {

            car.wait += dt / 1000;

            return;
        }

        let move =
            SPEED *
            dt /
            1000;

        /* =====================================================
           SAFETY GAP
        ===================================================== */

        const safeMove =
            availableMove(car);

        if (safeMove <= 0) {

            car.wait += dt / 1000;

            return;
        }

        if (safeMove !== Infinity) {

            move =
                Math.min(
                    move,
                    safeMove
                );
        }

        /* =====================================================
           RED / YELLOW SIGNAL
        ===================================================== */

        if (
            !canGo(car) &&
            !passedStop(car)
        ) {

            const stop =
                stopPosition(car);

            /*
                N
            */

            if (car.entry === "N") {

                const distance =
                    stop - car.y;

                if (distance <= 0) {

                    car.wait +=
                        dt / 1000;

                    return;
                }

                move =
                    Math.min(
                        move,
                        distance
                    );
            }

            /*
                S
            */

            else if (car.entry === "S") {

                const distance =
                    car.y - stop;

                if (distance <= 0) {

                    car.wait +=
                        dt / 1000;

                    return;
                }

                move =
                    Math.min(
                        move,
                        distance
                    );
            }

            /*
                W
            */

            else if (car.entry === "W") {

                const distance =
                    stop - car.x;

                if (distance <= 0) {

                    car.wait +=
                        dt / 1000;

                    return;
                }

                move =
                    Math.min(
                        move,
                        distance
                    );
            }

            /*
                E
            */

            else {

                const distance =
                    car.x - stop;

                if (distance <= 0) {

                    car.wait +=
                        dt / 1000;

                    return;
                }

                move =
                    Math.min(
                        move,
                        distance
                    );
            }
        }

        /* =====================================================
           MOVE
        ===================================================== */

        if (move <= 0) {

            car.wait +=
                dt / 1000;

            return;
        }

        /*
            N = DOWN
        */

        if (car.entry === "N") {
            car.y += move;
        }

        /*
            S = UP
        */

        else if (car.entry === "S") {
            car.y -= move;
        }

        /*
            W = RIGHT
        */

        else if (car.entry === "W") {
            car.x += move;
        }

        /*
            E = LEFT
        */

        else {
            car.x -= move;
        }

        render(car);

        /* =====================================================
           REMOVE AFTER EXIT
        ===================================================== */

        const { w, h } = dims();

        const outside =
            car.x < -CAR_W - 100 ||
            car.x > w + 100 ||
            car.y < -CAR_H - 100 ||
            car.y > h + 100;

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
       SIGNAL TIMER
    ========================================================= */

    function updateSignal(dt) {

        if (emergency) {
            return;
        }

        timer -= dt / 1000;

        if (timer > 0) {
            return;
        }

        /*
            GREEN → YELLOW
        */

        if (phase === "GREEN") {

            phase = "YELLOW";
            timer = YELLOW_TIME;

            return;
        }

        /*
            YELLOW → opposite GREEN
        */

        selected =
            selected === "NS"
                ? "EW"
                : "NS";

        phase = "GREEN";
        timer = GREEN_TIME;
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

                /*
                    EMERGENCY = ALL RED
                */

                if (emergency) {

                    red.classList.add("on");

                    yellow.classList.remove("on");

                    green.classList.remove("on");

                    return;
                }

                const active =
                    direction === selected;

                /*
                    ACTIVE DIRECTION
                */

                if (active) {

                    if (phase === "GREEN") {

                        red.classList.remove("on");

                        yellow.classList.remove("on");

                        green.classList.add("on");
                    }

                    else {

                        red.classList.remove("on");

                        yellow.classList.add("on");

                        green.classList.remove("on");
                    }

                    return;
                }

                /*
                    OTHER DIRECTION = RED
                */

                red.classList.add("on");

                yellow.classList.remove("on");

                green.classList.remove("on");
            });

        /* =====================================================
           UI
        ===================================================== */

        if (ui.dir) {

            ui.dir.textContent =
                emergency
                    ? "ALL STOP"
                    : selected;
        }

        if (ui.timer) {

            ui.timer.textContent =
                emergency
                    ? "STOP"
                    : Math.max(
                        0,
                        Math.ceil(timer)
                    );
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
            cars.filter(
                car =>
                    car.dir === "NS"
            );

        const ew =
            cars.filter(
                car =>
                    car.dir === "EW"
            );

        const waiting =
            cars.filter(
                car =>
                    car.wait > 0.2
            );

        function average(list) {

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

        const queueScore =
            cars.length * 3;

        const waitingScore =
            waiting.length * 0.5;

        const congestionScore =
            Math.min(
                100,
                cars.length * 1.8 +
                waiting.length * 0.7
            );

        if (ui.ns) {
            ui.ns.textContent =
                ns.length;
        }

        if (ui.ew) {
            ui.ew.textContent =
                ew.length;
        }

        if (ui.wns) {

            ui.wns.textContent =
                average(ns).toFixed(1) +
                "s";
        }

        if (ui.wew) {

            ui.wew.textContent =
                average(ew).toFixed(1) +
                "s";
        }

        if (ui.throughput) {

            ui.throughput.textContent =
                throughput;
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
                    ns.length /
                    MAX_CARS *
                    100
                ) + "%";
        }

        if (ui.ewbar) {

            ui.ewbar.style.width =
                Math.min(
                    100,
                    ew.length /
                    MAX_CARS *
                    100
                ) + "%";
        }

        if (ui.tpbar) {

            ui.tpbar.style.width =
                Math.min(
                    100,
                    throughput
                ) + "%";
        }
    }

    /* =========================================================
       EMERGENCY VEHICLE
    ========================================================= */

    function triggerEmergency() {

        if (emergency) {
            return;
        }

        emergency = true;

        emergencyEnd =
            performance.now() + 7000;

        const { w, h } = dims();

        if (emergencyEl) {

            emergencyEl.hidden = false;

            emergencyEl.textContent = "🚑";

            /*
                Emergency vehicle enters
                from the BOTTOM and travels UP.

                Therefore rotate it UP.
            */

            emergencyEl.style.transform =
                "rotate(-90deg)";

            emergencyEl.style.left =
                (
                    laneCenterX("S") -
                    21
                ) + "px";

            emergencyEl.style.top =
                (
                    h - 50
                ) + "px";
        }

        /*
            ALL NORMAL TRAFFIC STOPS
        */

        for (const car of cars) {
            car.wait += 0;
        }

        if (ui.status) {

            ui.status.innerHTML =
                "Emergency Vehicle: " +
                "<strong>" +
                "ACTIVE — ALL TRAFFIC STOPPED" +
                "</strong>";
        }

        updateSignals();
    }

    /* =========================================================
       EMERGENCY MOVEMENT
    ========================================================= */

    function updateEmergency(now, dt) {

        if (!emergency) {
            return;
        }

        if (!emergencyEl) {
            return;
        }

        const currentTop =
            parseFloat(
                emergencyEl.style.top || "0"
            );

        /*
            Emergency travels UP.
        */

        emergencyEl.style.top =
            (
                currentTop -
                110 *
                dt /
                1000
            ) + "px";

        /*
            End emergency.
        */

        if (now >= emergencyEnd) {

            emergency = false;

            emergencyEl.hidden = true;

            if (ui.status) {

                ui.status.innerHTML =
                    "Emergency Vehicle: " +
                    "<strong>NONE</strong>";
            }

            updateSignals();
        }
    }

    /* =========================================================
       EMERGENCY BUTTON
    ========================================================= */

    const emergencyBtn =
        document.getElementById(
            "emergencyBtn"
        );

    if (emergencyBtn) {

        emergencyBtn.addEventListener(
            "click",
            triggerEmergency
        );
    }

    /* =========================================================
       INITIAL TRAFFIC
       
       3 cars in each direction.
    ========================================================= */

    createCar("N", 0);
    createCar("N", 110);
    createCar("N", 220);

    createCar("S", 0);
    createCar("S", 110);
    createCar("S", 220);

    createCar("W", 0);
    createCar("W", 110);
    createCar("W", 220);

    createCar("E", 0);
    createCar("E", 110);
    createCar("E", 220);

    /* =========================================================
       SPAWN NEW TRAFFIC
    ========================================================= */

    function spawnTraffic() {

        if (emergency) {
            return;
        }

        if (cars.length >= MAX_CARS) {
            return;
        }

        const entries = [
            "N",
            "S",
            "W",
            "E"
        ];

        const entry =
            entries[
                Math.floor(
                    Math.random() *
                    entries.length
                )
            ];

        /*
            Make sure new car doesn't
            spawn directly on another car.
        */

        const sameLane =
            cars.filter(
                car =>
                    car.entry === entry
            );

        const { w, h } = dims();

        for (const car of sameLane) {

            if (
                entry === "N" &&
                car.y < 120
            ) {
                return;
            }

            if (
                entry === "S" &&
                car.y >
                h - 120
            ) {
                return;
            }

            if (
                entry === "W" &&
                car.x < 120
            ) {
                return;
            }

            if (
                entry === "E" &&
                car.x >
                w - 120
            ) {
                return;
            }
        }

        createCar(entry, 0);
    }

    /* =========================================================
       MAIN LOOP
    ========================================================= */

    function loop(now) {

        const dt =
            Math.min(
                40,
                now - lastTime
            );

        lastTime = now;

        /* =====================================================
           SPAWN
        ===================================================== */

        spawnClock += dt;

        if (spawnClock >= 1800) {

            spawnClock = 0;

            spawnTraffic();
        }

        /* =====================================================
           SIGNAL
        ===================================================== */

        updateSignal(dt);

        /* =====================================================
           EMERGENCY
        ===================================================== */

        updateEmergency(
            now,
            dt
        );

        /* =====================================================
           UPDATE CARS
           
           IMPORTANT:
           FRONT CAR FIRST.
           
           This prevents the following car from
           moving into the leader.
        ===================================================== */

        const directions = [
            "N",
            "S",
            "W",
            "E"
        ];

        for (const direction of directions) {

            const lane =
                cars
                    .filter(
                        car =>
                            car.entry ===
                            direction
                    )
                    .sort(
                        (a, b) =>
                            progress(b) -
                            progress(a)
                    );

            for (const car of lane) {

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

        /* =====================================================
           UI
        ===================================================== */

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
