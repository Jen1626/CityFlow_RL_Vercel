(() => {
    "use strict";

    /*
     * ============================================
     * CITYFLOW - TRAFFIC SIMULATION
     * ============================================
     *
     * Features:
     * - Actual 🚗 car emojis
     * - 🚑 emergency vehicle
     * - NS / EW traffic
     * - Red / Yellow / Green signals
     * - Safety gap between vehicles
     * - Cars stop before stop lines
     * - Cars never overlap
     * - Emergency vehicle stops all normal traffic
     * - Traffic metrics
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


    /* ============================================
       SETTINGS
       ============================================ */

    const CAR_W = 42;
    const CAR_H = 32;

    /*
     * Minimum visible distance between two cars.
     */
    const SAFETY_GAP = 28;

    /*
     * Traffic speed.
     */
    const SPEED = 0.11;

    /*
     * Maximum number of normal vehicles.
     */
    const MAX_CARS = 24;

    /*
     * Signal timings.
     */
    const GREEN_TIME = 8;
    const YELLOW_TIME = 2;


    /* ============================================
       STATE
       ============================================ */

    let cars = [];

    let nextId = 1;

    let selected = "NS";

    let phase = "GREEN";

    let timer = GREEN_TIME;

    let throughput = 0;

    let emergency = false;

    let emergencyEnd = 0;

    let last = performance.now();

    let spawnClock = 0;


    /* ============================================
       INTERSECTION DIMENSIONS
       ============================================ */

    function dims() {
        return {
            w: intersection.clientWidth,
            h: intersection.clientHeight
        };
    }


    /* ============================================
       CREATE CAR
       ============================================ */

    function createCar(entry, offset = 0) {

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


        /*
         * ========================================
         * START POSITIONS
         * ========================================
         */

        if (entry === "N") {

            car.x =
                w * 0.455 -
                CAR_W / 2;

            car.y =
                35 +
                offset;
        }


        if (entry === "S") {

            car.x =
                w * 0.545 -
                CAR_W / 2;

            car.y =
                h -
                45 -
                CAR_H -
                offset;
        }


        if (entry === "W") {

            car.x =
                35 +
                offset;

            car.y =
                h * 0.455 -
                CAR_H / 2;
        }


        if (entry === "E") {

            car.x =
                w -
                35 -
                CAR_W -
                offset;

            car.y =
                h * 0.545 -
                CAR_H / 2;
        }


        /*
         * ========================================
         * CAR ELEMENT
         * ========================================
         */

        car.el.className =
            "traffic-car";


        /*
         * Actual car emoji.
         */
        car.el.innerHTML =
            '<span class="car-emoji">🚗</span>';


        /*
         * Give each direction a class.
         */
        if (entry === "N") {
            car.el.classList.add("car-north");
        }

        if (entry === "S") {
            car.el.classList.add("car-south");
        }

        if (entry === "W") {
            car.el.classList.add("car-west");
        }

        if (entry === "E") {
            car.el.classList.add("car-east");
        }


        layer.appendChild(car.el);

        cars.push(car);

        render(car);
    }


    /* ============================================
       RENDER CAR
       ============================================ */

    function render(car) {

        car.el.style.left =
            Math.round(car.x) + "px";

        car.el.style.top =
            Math.round(car.y) + "px";
    }


    /* ============================================
       PROGRESS ALONG LANE
       ============================================ */

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


    /* ============================================
       FIND CAR IN FRONT
       ============================================ */

    function leaderOf(car) {

        let leader = null;

        let best = Infinity;

        for (const other of cars) {

            if (
                other === car ||
                other.entry !== car.entry
            ) {
                continue;
            }

            const distance =
                progress(other) -
                progress(car);


            if (
                distance > 0 &&
                distance < best
            ) {

                best = distance;

                leader = other;
            }
        }

        return leader;
    }


    /* ============================================
       STOP LINE POSITION
       ============================================ */

    function stopCoordinate(car) {

        const { w, h } = dims();


        /*
         * North
         */

        if (car.entry === "N") {

            return (
                h * 0.35 -
                CAR_H -
                8
            );
        }


        /*
         * South
         */

        if (car.entry === "S") {

            return (
                h * 0.65 +
                8
            );
        }


        /*
         * West
         */

        if (car.entry === "W") {

            return (
                w * 0.35 -
                CAR_W -
                8
            );
        }


        /*
         * East
         */

        return (
            w * 0.65 +
            8
        );
    }


    /* ============================================
       HAS CAR PASSED STOP LINE?
       ============================================ */

    function hasPassedStop(car) {

        const { w, h } = dims();


        if (car.entry === "N") {

            return (
                car.y >=
                h * 0.35
            );
        }


        if (car.entry === "S") {

            return (
                car.y <=
                h * 0.65 -
                CAR_H
            );
        }


        if (car.entry === "W") {

            return (
                car.x >=
                w * 0.35
            );
        }


        return (
            car.x <=
            w * 0.65 -
            CAR_W
        );
    }


    /* ============================================
       GREEN LIGHT FOR CAR?
       ============================================ */

    function greenFor(car) {

        return (
            !emergency &&
            selected === car.dir &&
            phase === "GREEN"
        );
    }


    /* ============================================
       UPDATE CAR
       ============================================ */

    function updateCar(car, dt) {

        /*
         * ========================================
         * EMERGENCY MODE
         * ========================================
         *
         * Every normal car completely stops.
         */

        if (emergency) {

            car.wait +=
                dt / 1000;

            return;
        }


        let move =
            SPEED * dt;


        /*
         * ========================================
         * SAFETY GAP
         * ========================================
         */

        const leader =
            leaderOf(car);


        if (leader) {

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


            /*
             * If safety gap is too small,
             * completely stop.
             */

            if (gap <= SAFETY_GAP) {

                car.wait +=
                    dt / 1000;

                return;
            }


            /*
             * Never move farther than
             * the available safe distance.
             */

            move =
                Math.min(
                    move,
                    Math.max(
                        0,
                        gap - SAFETY_GAP
                    )
                );
        }


        /*
         * ========================================
         * RED / YELLOW STOP LINE
         * ========================================
         */

        if (
            !greenFor(car) &&
            !hasPassedStop(car)
        ) {

            const stop =
                stopCoordinate(car);


            /*
             * NORTH
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
             * SOUTH
             */

            if (car.entry === "S") {

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
             * WEST
             */

            if (car.entry === "W") {

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
             * EAST
             */

            if (car.entry === "E") {

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


        /*
         * ========================================
         * ZERO MOVEMENT
         * ========================================
         */

        if (move <= 0.05) {

            car.wait +=
                dt / 1000;

            return;
        }


        /*
         * ========================================
         * MOVE CAR
         * ========================================
         */

        if (car.entry === "N") {
            car.y += move;
        }

        if (car.entry === "S") {
            car.y -= move;
        }

        if (car.entry === "W") {
            car.x += move;
        }

        if (car.entry === "E") {
            car.x -= move;
        }


        render(car);


        /*
         * ========================================
         * REMOVE CAR AFTER LEAVING
         * ========================================
         */

        const { w, h } = dims();


        if (
            car.x <
                -CAR_W - 60 ||

            car.x >
                w + 60 ||

            car.y <
                -CAR_H - 60 ||

            car.y >
                h + 60
        ) {

            throughput++;


            car.el.remove();


            cars =
                cars.filter(
                    c => c !== car
                );
        }
    }


    /* ============================================
       SIGNAL TIMER
       ============================================ */

    function updateSignal(dt) {

        if (emergency) {
            return;
        }


        timer -=
            dt / 1000;


        if (timer > 0) {
            return;
        }


        /*
         * GREEN -> YELLOW
         */

        if (phase === "GREEN") {

            phase = "YELLOW";

            timer =
                YELLOW_TIME;

            return;
        }


        /*
         * YELLOW -> OTHER DIRECTION GREEN
         */

        selected =
            selected === "NS"
                ? "EW"
                : "NS";


        phase = "GREEN";

        timer =
            GREEN_TIME;
    }


    /* ============================================
       UPDATE TRAFFIC SIGNALS
       ============================================ */

    function updateSignals() {

        document
            .querySelectorAll(".signal")
            .forEach(signal => {

                const active =
                    signal.dataset.direction ===
                        selected &&
                    !emergency;


                const red =
                    signal.querySelector(
                        ".red"
                    );

                const yellow =
                    signal.querySelector(
                        ".yellow"
                    );

                const green =
                    signal.querySelector(
                        ".green"
                    );


                if (red) {

                    red.classList.toggle(
                        "on",
                        !active ||
                        phase === "RED"
                    );
                }


                if (yellow) {

                    yellow.classList.toggle(
                        "on",
                        active &&
                        phase === "YELLOW"
                    );
                }


                if (green) {

                    green.classList.toggle(
                        "on",
                        active &&
                        phase === "GREEN"
                    );
                }
            });


        if (ui.dir) {

            ui.dir.textContent =
                emergency
                    ? "ALL STOP"
                    : selected;
        }


        if (ui.timer) {

            ui.timer.textContent =
                Math.max(
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


    /* ============================================
       METRICS
       ============================================ */

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
                    (ns.length /
                        MAX_CARS) *
                        100
                ) + "%";
        }


        if (ui.ewbar) {

            ui.ewbar.style.width =
                Math.min(
                    100,
                    (ew.length /
                        MAX_CARS) *
                        100
                ) + "%";
        }


        if (ui.tpbar) {

            ui.tpbar.style.width =
                (throughput % 101) +
                "%";
        }
    }


    /* ============================================
       EMERGENCY VEHICLE
       ============================================ */

    function triggerEmergency() {

        if (emergency) {
            return;
        }


        emergency = true;


        /*
         * Emergency lasts 7 seconds.
         */

        emergencyEnd =
            performance.now() +
            7000;


        const { w, h } =
            dims();


        /*
         * Show 🚑.
         */

        if (emergencyEl) {

            emergencyEl.hidden =
                false;


            emergencyEl.innerHTML =
                "🚑";


            emergencyEl.style.left =
                (
                    w / 2 - 22
                ) + "px";


            emergencyEl.style.top =
                (
                    h - 55
                ) + "px";
        }


        /*
         * Update status.
         */

        if (ui.status) {

            ui.status.innerHTML =
                "Emergency Vehicle: " +
                "<strong>" +
                "ACTIVE — ALL NORMAL TRAFFIC STOPPED" +
                "</strong>";
        }


        updateSignals();
    }


    /* ============================================
       EMERGENCY MOVEMENT
       ============================================ */

    function updateEmergency(now) {

        if (!emergency) {
            return;
        }


        if (!emergencyEl) {
            return;
        }


        const currentTop =
            parseFloat(
                emergencyEl.style.top ||
                "0"
            );


        /*
         * Move ambulance upward.
         */

        emergencyEl.style.top =
            (
                currentTop - 1.5
            ) + "px";


        /*
         * Emergency finished.
         */

        if (
            now >=
            emergencyEnd
        ) {

            emergency = false;


            emergencyEl.hidden =
                true;


            if (ui.status) {

                ui.status.innerHTML =
                    "Emergency Vehicle: " +
                    "<strong>NONE</strong>";
            }


            updateSignals();
        }
    }


    /* ============================================
       EMERGENCY BUTTON
       ============================================ */

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


    /* ============================================
       INITIAL TRAFFIC
       ============================================
       
       Cars start with a proper safety gap.
       ============================================ */

    createCar("N", 0);
    createCar("N", 75);
    createCar("N", 150);

    createCar("S", 0);
    createCar("S", 75);
    createCar("S", 150);

    createCar("W", 0);
    createCar("W", 75);
    createCar("W", 150);

    createCar("E", 0);
    createCar("E", 75);
    createCar("E", 150);


    /* ============================================
       AUTOMATIC TRAFFIC SPAWNING
       ============================================ */

    function spawnTraffic() {

        if (emergency) {
            return;
        }


        if (
            cars.length >=
            MAX_CARS
        ) {
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
         * Only spawn if there is enough
         * space at the entry.
         */

        const sameLane =
            cars.filter(
                car =>
                    car.entry ===
                    entry
            );


        if (
            sameLane.length
        ) {

            const nearest =
                sameLane.reduce(
                    (closest, car) => {

                        const p =
                            progress(car);

                        return p <
                            progress(
                                closest
                            )
                            ? car
                            : closest;
                    }
                );


            if (
                Math.abs(
                    progress(nearest)
                ) < 70
            ) {
                return;
            }
        }


        createCar(entry, 0);
    }


    /* ============================================
       MAIN LOOP
       ============================================ */

    function loop(now) {

        const dt =
            Math.min(
                40,
                now - last
            );


        last = now;


        spawnClock += dt;


        /*
         * Spawn a new car approximately
         * every 1.5 seconds.
         */

        if (
            spawnClock >= 1500
        ) {

            spawnClock = 0;

            spawnTraffic();
        }


        /*
         * Update signal.
         */

        updateSignal(dt);


        /*
         * Emergency vehicle.
         */

        updateEmergency(now);


        /*
         * ========================================
         * IMPORTANT
         * ========================================
         *
         * Process each lane independently.
         *
         * The vehicle in front is processed first,
         * followed by the vehicle behind it.
         *
         * This makes the safety gap stable.
         */

        const directions = [
            "N",
            "S",
            "W",
            "E"
        ];


        for (
            const direction
            of directions
        ) {

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


            lane.forEach(
                car => {

                    if (
                        cars.includes(car)
                    ) {

                        updateCar(
                            car,
                            dt
                        );
                    }
                }
            );
        }


        /*
         * Update interface.
         */

        updateSignals();

        updateMetrics();


        requestAnimationFrame(
            loop
        );
    }


    /* ============================================
       START
       ============================================ */

    updateSignals();

    updateMetrics();

    requestAnimationFrame(
        loop
    );

})();
