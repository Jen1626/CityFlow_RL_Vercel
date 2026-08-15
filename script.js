/* =========================================================
   CITYFLOW — COMPLETE TRAFFIC SIMULATION
   ---------------------------------------------------------
   Features:
   - Four-way intersection
   - North / South / East / West traffic
   - Red / Yellow / Green signals
   - Cars maintain safety distance
   - Cars stop before stop line
   - Cars do not overlap
   - Cars move only on their own lane
   - Emergency vehicle priority
   - All normal traffic stops during emergency
   - Correct car emoji orientation
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const CONFIG = {
        carSpeed: 0.55,
        emergencySpeed: 0.75,

        carGap: 58,

        greenTime: 8,
        yellowTime: 2,

        spawnInterval: 1100,

        emergencyDuration: 7000
    };


    /* =====================================================
       DOM
    ===================================================== */

    const intersection = document.querySelector("#intersection") ||
                         document.querySelector(".intersection") ||
                         document.querySelector("#trafficIntersection");

    const carsContainer = document.querySelector("#cars");

    const emergencyBtn =
        document.querySelector("#emergencyBtn") ||
        document.querySelector("button");

    if (!carsContainer) {
        console.error("CityFlow: #cars container not found.");
        return;
    }


    /* =====================================================
       METRIC ELEMENTS
    ===================================================== */

    const nsCountEl =
        document.querySelector("#nsCount") ||
        document.querySelector("#vehiclesNS");

    const ewCountEl =
        document.querySelector("#ewCount") ||
        document.querySelector("#vehiclesEW");

    const avgNSEl =
        document.querySelector("#avgNS") ||
        document.querySelector("#avgWaitNS");

    const avgEWEl =
        document.querySelector("#avgEW") ||
        document.querySelector("#avgWaitEW");

    const throughputEl =
        document.querySelector("#throughput");

    const congestionEl =
        document.querySelector("#congestion");

    const queueEl =
        document.querySelector("#queueScore");

    const waitingEl =
        document.querySelector("#waitingScore");

    const congestionScoreEl =
        document.querySelector("#congestionScore");

    const selectedDirectionEl =
        document.querySelector("#selectedDirection");

    const timerEl =
        document.querySelector("#timer") ||
        document.querySelector("#signalTimer");

    const phaseEl =
        document.querySelector("#phase") ||
        document.querySelector("#currentPhase");

    const emergencyStatusEl =
        document.querySelector("#emergencyStatus");


    /* =====================================================
       STATE
    ===================================================== */

    let cars = [];

    let nextCarId = 1;

    let throughput = 0;

    let emergencyActive = false;

    let emergencyCar = null;

    let emergencyEndTime = 0;

    let selectedDirection = "NS";

    let phase = "GREEN";

    let signalTimer = CONFIG.greenTime;

    let lastTime = performance.now();

    let lastSpawn = 0;

    let totalWaitNS = 0;
    let totalWaitEW = 0;

    let waitSamplesNS = 0;
    let waitSamplesEW = 0;


    /* =====================================================
       INTERSECTION GEOMETRY

       Everything is percentage based so it works
       with the existing Vercel layout.
    ===================================================== */

    function getGeometry() {

        const width = carsContainer.clientWidth;
        const height = carsContainer.clientHeight;

        return {
            width,
            height,

            centerX: width / 2,
            centerY: height / 2,

            roadWidth: Math.min(width * 0.28, 240),

            stopNorth: height * 0.39,
            stopSouth: height * 0.61,

            stopWest: width * 0.39,
            stopEast: width * 0.61,

            laneNSX: width / 2,
            laneEWY: height / 2
        };
    }


    /* =====================================================
       CAR CREATION
    ===================================================== */

    function createCar(direction) {

        const g = getGeometry();

        const car = {
            id: nextCarId++,

            direction,

            x: 0,
            y: 0,

            speed: CONFIG.carSpeed,

            stopped: false,

            waitTime: 0,

            passedIntersection: false,

            isEmergency: false,

            element: null,
            emoji: null
        };


        /* -----------------------------------------------
           START POSITIONS
        ------------------------------------------------ */

        if (direction === "N") {

            car.x = g.laneNSX;
            car.y = -35;

        } else if (direction === "S") {

            car.x = g.laneNSX;
            car.y = g.height + 35;

        } else if (direction === "W") {

            car.x = -35;
            car.y = g.laneEWY;

        } else if (direction === "E") {

            car.x = g.width + 35;
            car.y = g.laneEWY;
        }


        /* -----------------------------------------------
           ELEMENT
        ------------------------------------------------ */

        const element = document.createElement("div");

        element.className = "traffic-car";

        element.style.position = "absolute";

        element.style.width = "42px";
        element.style.height = "32px";

        element.style.display = "flex";
        element.style.alignItems = "center";
        element.style.justifyContent = "center";

        /*
         * VERY IMPORTANT:
         * Parent is NEVER rotated.
         */
        element.style.transform = "translate(-50%, -50%)";

        element.style.transition = "none";

        element.style.zIndex = "20";


        const emoji = document.createElement("span");

        emoji.className = "car-emoji";

        emoji.textContent = "🚗";

        emoji.style.display = "block";

        emoji.style.fontSize = "28px";

        emoji.style.lineHeight = "32px";

        emoji.style.width = "42px";

        emoji.style.height = "32px";

        emoji.style.textAlign = "center";

        emoji.style.transformOrigin = "center center";


        /* -----------------------------------------------
           CORRECT DIRECTIONS

           🚗 naturally faces RIGHT

           E = RIGHT  = 0°
           W = LEFT   = 180°
           N = UP     = -90°
           S = DOWN   = 90°
        ------------------------------------------------ */

        if (direction === "E") {
            emoji.style.transform = "rotate(0deg)";
        }

        if (direction === "W") {
            emoji.style.transform = "rotate(180deg)";
        }

        if (direction === "N") {
            emoji.style.transform = "rotate(-90deg)";
        }

        if (direction === "S") {
            emoji.style.transform = "rotate(90deg)";
        }


        element.appendChild(emoji);

        carsContainer.appendChild(element);

        car.element = element;
        car.emoji = emoji;

        cars.push(car);

        updateCarPosition(car);
    }


    /* =====================================================
       EMERGENCY VEHICLE
    ===================================================== */

    function createEmergencyVehicle() {

        if (emergencyCar) return;

        const g = getGeometry();

        const car = {
            id: "EMERGENCY",

            direction: "N",

            x: g.laneNSX,

            y: g.height + 45,

            speed: CONFIG.emergencySpeed,

            stopped: false,

            waitTime: 0,

            passedIntersection: false,

            isEmergency: true,

            element: null,
            emoji: null
        };


        const element = document.createElement("div");

        element.className = "traffic-car emergency-car";

        element.style.position = "absolute";

        element.style.width = "44px";
        element.style.height = "34px";

        element.style.display = "flex";

        element.style.alignItems = "center";

        element.style.justifyContent = "center";

        element.style.transform = "translate(-50%, -50%)";

        element.style.transition = "none";

        element.style.zIndex = "100";


        const emoji = document.createElement("span");

        emoji.className = "car-emoji";

        emoji.textContent = "🚑";

        emoji.style.fontSize = "30px";

        emoji.style.lineHeight = "34px";

        /*
         * Ambulance also points upward.
         */
        emoji.style.transform = "rotate(-90deg)";

        emoji.style.transformOrigin = "center center";


        element.appendChild(emoji);

        carsContainer.appendChild(element);

        car.element = element;

        car.emoji = emoji;

        emergencyCar = car;

        emergencyActive = true;

        emergencyEndTime =
            performance.now() + CONFIG.emergencyDuration;


        if (emergencyStatusEl) {
            emergencyStatusEl.innerHTML =
                "<strong>ACTIVE — ALL TRAFFIC STOPPED</strong>";
        }

        if (selectedDirectionEl) {
            selectedDirectionEl.textContent = "EMERGENCY";
        }

        if (phaseEl) {
            phaseEl.textContent = "EMERGENCY STOP";
        }

        if (timerEl) {
            timerEl.textContent = "STOP";
        }

        updateSignalVisuals();
    }


    /* =====================================================
       EMERGENCY BUTTON
    ===================================================== */

    if (emergencyBtn) {

        emergencyBtn.addEventListener("click", () => {

            if (!emergencyActive) {
                createEmergencyVehicle();
            }

        });
    }


    /* =====================================================
       REMOVE EMERGENCY
    ===================================================== */

    function endEmergency() {

        emergencyActive = false;

        if (emergencyCar) {

            if (emergencyCar.element) {
                emergencyCar.element.remove();
            }

            cars = cars.filter(
                c => c !== emergencyCar
            );

            emergencyCar = null;
        }


        if (emergencyStatusEl) {
            emergencyStatusEl.textContent =
                "Emergency Vehicle: NONE";
        }

        selectedDirection =
            calculateBestDirection();

        phase = "GREEN";

        signalTimer = CONFIG.greenTime;

        updateSignalVisuals();
    }


    /* =====================================================
       SIGNAL LOGIC
    ===================================================== */

    function calculateBestDirection() {

        let ns = 0;
        let ew = 0;

        cars.forEach(car => {

            if (car.isEmergency) return;

            if (car.direction === "N" ||
                car.direction === "S") {

                ns++;

            } else {

                ew++;
            }

        });

        return ns >= ew ? "NS" : "EW";
    }


    function updateSignalVisuals() {

        /*
         * We support several possible HTML class names.
         */

        const signals =
            document.querySelectorAll(
                ".traffic-signal, .signal, .traffic-light"
            );


        signals.forEach(signal => {

            signal.classList.remove(
                "red",
                "yellow",
                "green"
            );


            if (emergencyActive) {

                signal.classList.add("red");

                return;
            }


            const direction =
                signal.dataset.direction ||
                signal.getAttribute("data-direction");


            if (!direction) return;


            let isActive = false;


            if (selectedDirection === "NS") {

                isActive =
                    direction === "N" ||
                    direction === "S";

            } else {

                isActive =
                    direction === "E" ||
                    direction === "W";
            }


            if (!isActive) {

                signal.classList.add("red");

            } else if (phase === "GREEN") {

                signal.classList.add("green");

            } else if (phase === "YELLOW") {

                signal.classList.add("yellow");

            } else {

                signal.classList.add("red");
            }

        });


        /*
         * Also support individual light elements.
         */

        document
            .querySelectorAll(
                ".signal-light, .light"
            )
            .forEach(light => {

                const parent =
                    light.closest(
                        ".traffic-signal, .signal, .traffic-light"
                    );

                if (!parent) return;

                const color =
                    light.dataset.color;

                light.classList.remove(
                    "active",
                    "on"
                );


                if (emergencyActive) {

                    if (color === "red") {
                        light.classList.add("active");
                    }

                    return;
                }


                if (phase === "GREEN" &&
                    color === "green") {

                    light.classList.add("active");

                } else if (
                    phase === "YELLOW" &&
                    color === "yellow"
                ) {

                    light.classList.add("active");

                } else if (
                    phase === "RED" &&
                    color === "red"
                ) {

                    light.classList.add("active");
                }

            });
    }


    /* =====================================================
       CAN CAR MOVE?
    ===================================================== */

    function signalAllowsMovement(car) {

        if (emergencyActive &&
            !car.isEmergency) {

            return false;
        }


        if (car.isEmergency) {
            return true;
        }


        const ns =
            car.direction === "N" ||
            car.direction === "S";


        if (selectedDirection === "NS") {

            if (ns) {

                return phase === "GREEN";

            }

            return false;

        } else {

            if (!ns) {

                return phase === "GREEN";

            }

            return false;
        }
    }


    /* =====================================================
       STOP LINE CHECK
    ===================================================== */

    function atStopLine(car) {

        const g = getGeometry();

        const stopDistance = 48;


        if (car.direction === "N") {

            return (
                car.y >= g.stopNorth - stopDistance &&
                car.y < g.centerY
            );
        }


        if (car.direction === "S") {

            return (
                car.y <= g.stopSouth + stopDistance &&
                car.y > g.centerY
            );
        }


        if (car.direction === "W") {

            return (
                car.x >= g.stopWest - stopDistance &&
                car.x < g.centerX
            );
        }


        if (car.direction === "E") {

            return (
                car.x <= g.stopEast + stopDistance &&
                car.x > g.centerX
            );
        }


        return false;
    }


    /* =====================================================
       SAFE FOLLOWING DISTANCE

       This is the important collision prevention part.
    ===================================================== */

    function carInFront(car) {

        const sameLane =
            cars
                .filter(other => {

                    if (other === car) {
                        return false;
                    }

                    if (other.isEmergency &&
                        !car.isEmergency) {

                        /*
                         * Normal vehicles must stay
                         * behind emergency vehicle.
                         */
                        return true;
                    }

                    if (other.direction !== car.direction) {
                        return false;
                    }

                    return true;
                });


        let closest = null;

        let closestDistance = Infinity;


        sameLane.forEach(other => {

            let distance;


            if (car.direction === "N") {

                distance =
                    other.y - car.y;

            } else if (car.direction === "S") {

                distance =
                    car.y - other.y;

            } else if (car.direction === "E") {

                distance =
                    car.x - other.x;

            } else {

                distance =
                    other.x - car.x;
            }


            /*
             * Only vehicles ahead count.
             */
            if (distance > 0 &&
                distance < closestDistance) {

                closestDistance = distance;

                closest = other;
            }

        });


        return {
            car: closest,
            distance: closestDistance
        };
    }


    /* =====================================================
       MOVE CAR
    ===================================================== */

    function moveCar(car, delta) {

        if (car.isEmergency) {

            moveEmergency(car, delta);

            return;
        }


        /*
         * Emergency = everyone stops.
         */
        if (emergencyActive) {

            car.stopped = true;

            car.waitTime += delta;

            return;
        }


        const g = getGeometry();

        const front = carInFront(car);

        let canMove = signalAllowsMovement(car);


        /* -----------------------------------------------
           SAFETY GAP
        ------------------------------------------------ */

        if (front.car) {

            if (front.distance < CONFIG.carGap) {

                canMove = false;
            }
        }


        /* -----------------------------------------------
           RED / YELLOW STOP LINE
        ------------------------------------------------ */

        if (!signalAllowsMovement(car) &&
            atStopLine(car)) {

            canMove = false;
        }


        /* -----------------------------------------------
           MOVEMENT
        ------------------------------------------------ */

        if (canMove) {

            car.stopped = false;

            const movement =
                car.speed * delta;


            if (car.direction === "N") {
                car.y -= movement;
            }

            if (car.direction === "S") {
                car.y += movement;
            }

            if (car.direction === "E") {
                car.x += movement;
            }

            if (car.direction === "W") {
                car.x -= movement;
            }

        } else {

            car.stopped = true;

            car.waitTime += delta;

            if (
                car.direction === "N" ||
                car.direction === "S"
            ) {

                totalWaitNS += delta;
                waitSamplesNS++;

            } else {

                totalWaitEW += delta;
                waitSamplesEW++;
            }
        }


        /* -----------------------------------------------
           COUNT PASSED VEHICLES
        ------------------------------------------------ */

        if (!car.passedIntersection) {

            if (
                car.direction === "N" &&
                car.y > g.centerY + 35
            ) {
                car.passedIntersection = true;
                throughput++;
            }

            if (
                car.direction === "S" &&
                car.y < g.centerY - 35
            ) {
                car.passedIntersection = true;
                throughput++;
            }

            if (
                car.direction === "E" &&
                car.x > g.centerX + 35
            ) {
                car.passedIntersection = true;
                throughput++;
            }

            if (
                car.direction === "W" &&
                car.x < g.centerX - 35
            ) {
                car.passedIntersection = true;
                throughput++;
            }
        }


        /* -----------------------------------------------
           REMOVE OFFSCREEN
        ------------------------------------------------ */

        const margin = 80;

        if (
            car.x < -margin ||
            car.x > g.width + margin ||
            car.y < -margin ||
            car.y > g.height + margin
        ) {

            removeCar(car);
        }
    }


    /* =====================================================
       EMERGENCY MOVEMENT
    ===================================================== */

    function moveEmergency(car, delta) {

        const g = getGeometry();

        car.y -= car.speed * delta;


        if (car.y < -70) {

            removeCar(car);

            emergencyCar = null;

            emergencyActive = false;

            if (emergencyStatusEl) {
                emergencyStatusEl.textContent =
                    "Emergency Vehicle: NONE";
            }

            selectedDirection =
                calculateBestDirection();

            signalTimer =
                CONFIG.greenTime;

            updateSignalVisuals();
        }
    }


    /* =====================================================
       UPDATE POSITION
    ===================================================== */

    function updateCarPosition(car) {

        if (!car.element) return;

        /*
         * CRITICAL:
         * Only translate the parent.
         * Never rotate it.
         */
        car.element.style.left =
            `${car.x}px`;

        car.element.style.top =
            `${car.y}px`;

        car.element.style.transform =
            "translate(-50%, -50%)";
    }


    /* =====================================================
       REMOVE CAR
    ===================================================== */

    function removeCar(car) {

        if (car.element) {
            car.element.remove();
        }

        cars = cars.filter(
            c => c !== car
        );
    }


    /* =====================================================
       SPAWNING
    ===================================================== */

    function spawnTraffic(now) {

        if (now - lastSpawn <
            CONFIG.spawnInterval) {

            return;
        }


        lastSpawn = now;


        const directions = [
            "N",
            "S",
            "E",
            "W"
        ];


        /*
         * Random traffic direction.
         */
        const direction =
            directions[
                Math.floor(
                    Math.random() *
                    directions.length
                )
            ];


        /*
         * Prevent excessive traffic.
         */
        const normalCars =
            cars.filter(
                c => !c.isEmergency
            );


        if (normalCars.length >= 18) {
            return;
        }


        createCar(direction);
    }


    /* =====================================================
       SIGNAL TIMER
    ===================================================== */

    function updateSignal(delta) {

        if (emergencyActive) {
            return;
        }


        signalTimer -= delta;


        if (signalTimer <= 0) {

            if (phase === "GREEN") {

                phase = "YELLOW";

                signalTimer =
                    CONFIG.yellowTime;

            } else {

                phase = "GREEN";

                selectedDirection =
                    selectedDirection === "NS"
                        ? "EW"
                        : "NS";

                signalTimer =
                    CONFIG.greenTime;
            }


            updateSignalVisuals();
        }
    }


    /* =====================================================
       METRICS
    ===================================================== */

    function updateMetrics() {

        const nsCars =
            cars.filter(c =>
                !c.isEmergency &&
                (c.direction === "N" ||
                 c.direction === "S")
            );

        const ewCars =
            cars.filter(c =>
                !c.isEmergency &&
                (c.direction === "E" ||
                 c.direction === "W")
            );


        const queueScore =
            cars.filter(
                c => !c.isEmergency && c.stopped
            ).length * 3;


        const waitingScore =
            (
                totalWaitNS +
                totalWaitEW
            ) / 10;


        const congestionScore =
            (
                nsCars.length +
                ewCars.length
            ) * 1.5;


        if (nsCountEl) {
            nsCountEl.textContent =
                nsCars.length;
        }

        if (ewCountEl) {
            ewCountEl.textContent =
                ewCars.length;
        }


        const avgNS =
            waitSamplesNS > 0
                ? totalWaitNS / waitSamplesNS
                : 0;

        const avgEW =
            waitSamplesEW > 0
                ? totalWaitEW / waitSamplesEW
                : 0;


        if (avgNSEl) {
            avgNSEl.textContent =
                avgNS.toFixed(1) + "s";
        }

        if (avgEWEl) {
            avgEWEl.textContent =
                avgEW.toFixed(1) + "s";
        }


        if (throughputEl) {
            throughputEl.textContent =
                throughput;
        }


        let congestionText = "LOW";

        if (congestionScore > 25) {
            congestionText = "HIGH";
        } else if (congestionScore > 12) {
            congestionText = "MEDIUM";
        }


        if (congestionEl) {
            congestionEl.textContent =
                congestionText;
        }


        if (queueEl) {
            queueEl.textContent =
                queueScore.toFixed(1);
        }


        if (waitingEl) {
            waitingEl.textContent =
                waitingScore.toFixed(1);
        }


        if (congestionScoreEl) {
            congestionScoreEl.textContent =
                congestionScore.toFixed(1);
        }


        if (selectedDirectionEl) {

            selectedDirectionEl.textContent =
                emergencyActive
                    ? "EMERGENCY"
                    : selectedDirection;
        }


        if (timerEl) {

            if (emergencyActive) {

                timerEl.textContent = "STOP";

            } else {

                timerEl.textContent =
                    Math.max(
                        0,
                        Math.ceil(signalTimer)
                    );
            }
        }


        if (phaseEl) {

            phaseEl.textContent =
                emergencyActive
                    ? "EMERGENCY STOP"
                    : phase;
        }
    }


    /* =====================================================
       MAIN LOOP
    ===================================================== */

    function animationLoop(now) {

        const delta =
            Math.min(
                (now - lastTime) / 16.67,
                3
            );

        lastTime = now;


        /*
         * Emergency timeout.
         */
        if (
            emergencyActive &&
            now >= emergencyEndTime
        ) {

            endEmergency();
        }


        /*
         * Spawn normal traffic.
         */
        if (!emergencyActive) {

            spawnTraffic(now);
        }


        /*
         * Update signal.
         */
        updateSignal(delta / 60);


        /*
         * Move cars.
         *
         * Copy array because cars can be removed
         * during iteration.
         */
        [...cars].forEach(car => {

            moveCar(car, delta);

            updateCarPosition(car);
        });


        /*
         * Metrics.
         */
        updateMetrics();


        requestAnimationFrame(
            animationLoop
        );
    }


    /* =====================================================
       INITIAL TRAFFIC
    ===================================================== */

    createCar("N");
    createCar("N");

    createCar("S");
    createCar("S");

    createCar("E");
    createCar("E");

    createCar("W");
    createCar("W");


    /* =====================================================
       INITIAL SIGNAL
    ===================================================== */

    selectedDirection = "NS";

    phase = "GREEN";

    signalTimer = CONFIG.greenTime;

    updateSignalVisuals();

    updateMetrics();


    /* =====================================================
       START
    ===================================================== */

    requestAnimationFrame(
        animationLoop
    );

});
