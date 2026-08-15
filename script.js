"use strict";

/* =========================================================
   CITYFLOW - FINAL TRAFFIC SIMULATION
   ========================================================= */

const CONFIG = {
    speed: 85,
    safetyGap: 55,

    greenTime: 8,
    yellowTime: 2,

    spawnInterval: 2.2,

    maxCars: 18,

    carWidth: 40,
    carHeight: 30
};


/* =========================================================
   DOM
========================================================= */

const intersection =
    document.getElementById("intersection");

const carsLayer =
    document.getElementById("cars");

const emergencyBtn =
    document.getElementById("emergencyBtn");

const emergencyCar =
    document.getElementById("emergencyCar");

const emergencyStatus =
    document.getElementById("emergencyStatus");


/* =========================================================
   STATS
========================================================= */

const vehiclesNS =
    document.getElementById("vehiclesNS");

const vehiclesEW =
    document.getElementById("vehiclesEW");

const avgWaitNS =
    document.getElementById("avgWaitNS");

const avgWaitEW =
    document.getElementById("avgWaitEW");

const throughputEl =
    document.getElementById("throughput");

const congestionEl =
    document.getElementById("congestion");

const queueScore =
    document.getElementById("queueScore");

const waitingScore =
    document.getElementById("waitingScore");

const congestionScore =
    document.getElementById("congestionScore");

const selectedDirection =
    document.getElementById("selectedDirection");

const signalTimer =
    document.getElementById("signalTimer");

const currentPhase =
    document.getElementById("currentPhase");

const nsBar =
    document.getElementById("nsBar");

const ewBar =
    document.getElementById("ewBar");

const throughputBar =
    document.getElementById("throughputBar");


/* =========================================================
   STATE
========================================================= */

let cars = [];

let carId = 0;

let selectedAxis = "NS";

let phase = "GREEN";

let timer = CONFIG.greenTime;

let emergencyActive = false;

let throughput = 0;

let spawnClock = 0;

let lastTime = performance.now();


/* =========================================================
   GEOMETRY
========================================================= */

function geometry() {

    const width =
        intersection.clientWidth;

    const height =
        intersection.clientHeight;

    return {

        width,
        height,

        centerX:
            width / 2,

        centerY:
            height / 2,

        roadLeft:
            width * 0.35,

        roadRight:
            width * 0.65,

        roadTop:
            height * 0.35,

        roadBottom:
            height * 0.65,

        /*
        Lane centers.

        Vertical road:
        left lane  = 42.5%
        right lane = 57.5%

        Horizontal road:
        upper lane = 42.5%
        lower lane = 57.5%
        */

        northSouthLeft:
            width * 0.425,

        northSouthRight:
            width * 0.575,

        eastWestTop:
            height * 0.425,

        eastWestBottom:
            height * 0.575
    };
}


/* =========================================================
   CREATE CAR
========================================================= */

function createCar(direction, offset = 0) {

    if (
        cars.length >=
        CONFIG.maxCars
    ) {
        return null;
    }

    const g =
        geometry();

    const el =
        document.createElement("div");

    el.className =
        "traffic-car";

    /*
    IMPORTANT:
    We rotate ONLY the emoji.

    This prevents the position box from
    rotating and causing diagonal movement.
    */

    el.innerHTML =
        `<span class="car-emoji">🚗</span>`;

    const car = {

        id:
            ++carId,

        direction,

        x: 0,

        y: 0,

        wait: 0,

        crossed: false,

        element: el
    };


    /* =====================================================
       INITIAL POSITION
    ===================================================== */

    if (
        direction === "N"
    ) {

        car.x =
            g.northSouthLeft;

        car.y =
            -60 -
            offset;
    }


    else if (
        direction === "S"
    ) {

        car.x =
            g.northSouthRight;

        car.y =
            g.height +
            60 +
            offset;
    }


    else if (
        direction === "W"
    ) {

        car.x =
            -60 -
            offset;

        car.y =
            g.eastWestTop;
    }


    else if (
        direction === "E"
    ) {

        car.x =
            g.width +
            60 +
            offset;

        car.y =
            g.eastWestBottom;
    }


    carsLayer.appendChild(el);

    cars.push(car);

    drawCar(car);

    return car;
}


/* =========================================================
   DRAW CAR
========================================================= */

function drawCar(car) {

    car.element.style.left =
        `${car.x}px`;

    car.element.style.top =
        `${car.y}px`;


    /*
    Correct physical orientation:

    N = car facing UP
    S = car facing DOWN
    W = car facing LEFT
    E = car facing RIGHT
    */

    const emoji =
        car.element.querySelector(
            ".car-emoji"
        );

    if (!emoji) {
        return;
    }


    let rotation = 0;


    if (
        car.direction === "N"
    ) {

        rotation = -90;
    }

    else if (
        car.direction === "S"
    ) {

        rotation = 90;
    }

    else if (
        car.direction === "W"
    ) {

        rotation = 180;
    }

    else if (
        car.direction === "E"
    ) {

        rotation = 0;
    }


    emoji.style.transform =
        `rotate(${rotation}deg)`;
}


/* =========================================================
   PROGRESS
========================================================= */

function progress(car) {

    if (
        car.direction === "N"
    ) {

        return car.y;
    }

    if (
        car.direction === "S"
    ) {

        return -car.y;
    }

    if (
        car.direction === "W"
    ) {

        return car.x;
    }

    return -car.x;
}


/* =========================================================
   CAR AHEAD
========================================================= */

function carAhead(car) {

    let nearest = null;

    let nearestDistance =
        Infinity;


    for (
        const other of cars
    ) {

        if (
            other === car
        ) {
            continue;
        }

        if (
            other.direction !==
            car.direction
        ) {
            continue;
        }


        const distance =
            progress(other) -
            progress(car);


        if (
            distance > 0 &&
            distance <
                nearestDistance
        ) {

            nearestDistance =
                distance;

            nearest =
                other;
        }
    }


    return nearest;
}


/* =========================================================
   STOP LINE
========================================================= */

function stopPosition(car) {

    const g =
        geometry();


    /*
    N = moving DOWN
    */

    if (
        car.direction === "N"
    ) {

        return (
            g.roadTop -
            12
        );
    }


    /*
    S = moving UP
    */

    if (
        car.direction === "S"
    ) {

        return (
            g.roadBottom +
            12
        );
    }


    /*
    W = moving RIGHT
    */

    if (
        car.direction === "W"
    ) {

        return (
            g.roadLeft -
            12
        );
    }


    /*
    E = moving LEFT
    */

    return (
        g.roadRight +
        12
    );
}


/* =========================================================
   HAS PASSED STOP LINE
========================================================= */

function hasPassedStop(car) {

    const g =
        geometry();


    if (
        car.direction === "N"
    ) {

        return (
            car.y >
            g.roadTop + 35
        );
    }


    if (
        car.direction === "S"
    ) {

        return (
            car.y <
            g.roadBottom - 35
        );
    }


    if (
        car.direction === "W"
    ) {

        return (
            car.x >
            g.roadLeft + 35
        );
    }


    return (
        car.x <
        g.roadRight - 35
    );
}


/* =========================================================
   SIGNAL ALLOWS MOVEMENT
========================================================= */

function signalAllows(car) {

    /*
    Emergency:
    absolutely everything stops.
    */

    if (
        emergencyActive
    ) {
        return false;
    }


    /*
    Once a car has entered the
    intersection, allow it to finish.
    */

    if (
        car.crossed
    ) {
        return true;
    }


    /*
    Yellow means STOP new traffic.
    */

    if (
        phase !== "GREEN"
    ) {
        return false;
    }


    if (
        car.direction === "N" ||
        car.direction === "S"
    ) {

        return selectedAxis === "NS";
    }


    return selectedAxis === "EW";
}


/* =========================================================
   UPDATE CAR
========================================================= */

function updateCar(car, dt) {

    /*
    Emergency:
    freeze every normal car.
    */

    if (
        emergencyActive
    ) {

        car.wait += dt;

        drawCar(car);

        return;
    }


    /*
    If car passed the stop line,
    it is now inside/after intersection.
    */

    if (
        hasPassedStop(car)
    ) {

        car.crossed = true;
    }


    let movement =
        CONFIG.speed * dt;


    let newPosition;


    /*
    ==========================================
    N
    ==========================================
    */

    if (
        car.direction === "N"
    ) {

        newPosition =
            car.y + movement;


        /*
        Red / yellow stop line.
        */

        if (
            !car.crossed &&
            !signalAllows(car)
        ) {

            newPosition =
                Math.min(
                    newPosition,
                    stopPosition(car)
                );
        }


        /*
        Safety gap.
        */

        const front =
            carAhead(car);


        if (
            front
        ) {

            const maxPosition =
                front.y -
                CONFIG.safetyGap;


            newPosition =
                Math.min(
                    newPosition,
                    maxPosition
                );
        }


        if (
            newPosition <=
            car.y + 0.5
        ) {

            car.wait += dt;

        } else {

            car.wait *= 0.98;
        }


        car.y =
            Math.max(
                car.y,
                newPosition
            );
    }


    /*
    ==========================================
    S
    ==========================================
    */

    else if (
        car.direction === "S"
    ) {

        newPosition =
            car.y - movement;


        if (
            !car.crossed &&
            !signalAllows(car)
        ) {

            newPosition =
                Math.max(
                    newPosition,
                    stopPosition(car)
                );
        }


        const front =
            carAhead(car);


        if (
            front
        ) {

            const minPosition =
                front.y +
                CONFIG.safetyGap;


            newPosition =
                Math.max(
                    newPosition,
                    minPosition
                );
        }


        if (
            newPosition >=
            car.y - 0.5
        ) {

            car.wait += dt;

        } else {

            car.wait *= 0.98;
        }


        car.y =
            Math.min(
                car.y,
                newPosition
            );
    }


    /*
    ==========================================
    W
    ==========================================
    */

    else if (
        car.direction === "W"
    ) {

        newPosition =
            car.x + movement;


        if (
            !car.crossed &&
            !signalAllows(car)
        ) {

            newPosition =
                Math.min(
                    newPosition,
                    stopPosition(car)
                );
        }


        const front =
            carAhead(car);


        if (
            front
        ) {

            const maxPosition =
                front.x -
                CONFIG.safetyGap;


            newPosition =
                Math.min(
                    newPosition,
                    maxPosition
                );
        }


        if (
            newPosition <=
            car.x + 0.5
        ) {

            car.wait += dt;

        } else {

            car.wait *= 0.98;
        }


        car.x =
            Math.max(
                car.x,
                newPosition
            );
    }


    /*
    ==========================================
    E
    ==========================================
    */

    else {

        newPosition =
            car.x - movement;


        if (
            !car.crossed &&
            !signalAllows(car)
        ) {

            newPosition =
                Math.max(
                    newPosition,
                    stopPosition(car)
                );
        }


        const front =
            carAhead(car);


        if (
            front
        ) {

            const minPosition =
                front.x +
                CONFIG.safetyGap;


            newPosition =
                Math.max(
                    newPosition,
                    minPosition
                );
        }


        if (
            newPosition >=
            car.x - 0.5
        ) {

            car.wait += dt;

        } else {

            car.wait *= 0.98;
        }


        car.x =
            Math.min(
                car.x,
                newPosition
            );
    }


    drawCar(car);


    /*
    ==========================================
    REMOVE WHEN OUT OF SCREEN
    ==========================================
    */

    const g =
        geometry();


    if (
        car.direction === "N" &&
        car.y >
            g.height + 70
    ) {

        removeCar(car);

        return;
    }


    if (
        car.direction === "S" &&
        car.y <
            -70
    ) {

        removeCar(car);

        return;
    }


    if (
        car.direction === "W" &&
        car.x >
            g.width + 70
    ) {

        removeCar(car);

        return;
    }


    if (
        car.direction === "E" &&
        car.x <
            -70
    ) {

        removeCar(car);

        return;
    }
}


/* =========================================================
   REMOVE CAR
========================================================= */

function removeCar(car) {

    if (
        car.element
    ) {

        car.element.remove();
    }


    cars =
        cars.filter(
            c =>
                c !== car
        );


    throughput++;
}


/* =========================================================
   COLLISION / SAFETY PROTECTION
========================================================= */

function enforceSafety() {

    const directions = [
        "N",
        "S",
        "W",
        "E"
    ];


    for (
        const direction of directions
    ) {

        const laneCars =
            cars
                .filter(
                    car =>
                        car.direction ===
                        direction
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        progress(b) -
                        progress(a)
                );


        for (
            let i = 1;
            i <
            laneCars.length;
            i++
        ) {

            const front =
                laneCars[i - 1];

            const back =
                laneCars[i];


            if (
                direction === "N"
            ) {

                const allowed =
                    front.y -
                    CONFIG.safetyGap;


                if (
                    back.y >
                    allowed
                ) {

                    back.y =
                        allowed;
                }
            }


            else if (
                direction === "S"
            ) {

                const allowed =
                    front.y +
                    CONFIG.safetyGap;


                if (
                    back.y <
                    allowed
                ) {

                    back.y =
                        allowed;
                }
            }


            else if (
                direction === "W"
            ) {

                const allowed =
                    front.x -
                    CONFIG.safetyGap;


                if (
                    back.x >
                    allowed
                ) {

                    back.x =
                        allowed;
                }
            }


            else {

                const allowed =
                    front.x +
                    CONFIG.safetyGap;


                if (
                    back.x <
                    allowed
                ) {

                    back.x =
                        allowed;
                }
            }


            drawCar(back);
        }
    }
}


/* =========================================================
   SIGNAL CONTROL
========================================================= */

const signals =
    document.querySelectorAll(
        ".signal"
    );


function setSignal(
    signal,
    colour
) {

    if (!signal) {
        return;
    }


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


    /*
    Remove previous state.
    */

    if (red)
        red.classList.remove("on");

    if (yellow)
        yellow.classList.remove("on");

    if (green)
        green.classList.remove("on");


    /*
    Turn selected colour ON.
    */

    if (
        colour === "RED" &&
        red
    ) {

        red.classList.add("on");
    }


    if (
        colour === "YELLOW" &&
        yellow
    ) {

        yellow.classList.add("on");
    }


    if (
        colour === "GREEN" &&
        green
    ) {

        green.classList.add("on");
    }
}


/* =========================================================
   UPDATE ALL FOUR SIGNALS
========================================================= */

function updateSignals() {

    signals.forEach(
        signal => {

            const direction =
                signal.dataset.direction;


            /*
            Emergency:
            ALL RED
            */

            if (
                emergencyActive
            ) {

                setSignal(
                    signal,
                    "RED"
                );

                return;
            }


            /*
            NS direction
            */

            if (
                direction ===
                "NS"
            ) {

                if (
                    selectedAxis ===
                    "NS"
                ) {

                    setSignal(
                        signal,
                        phase
                    );

                } else {

                    setSignal(
                        signal,
                        "RED"
                    );
                }

                return;
            }


            /*
            EW direction
            */

            if (
                selectedAxis ===
                "EW"
            ) {

                setSignal(
                    signal,
                    phase
                );

            } else {

                setSignal(
                    signal,
                    "RED"
                );
            }
        }
    );
}


/* =========================================================
   SIGNAL TIMER
========================================================= */

function updateSignal(dt) {

    if (
        emergencyActive
    ) {
        return;
    }


    timer -= dt;


    if (
        timer > 0
    ) {
        return;
    }


    /*
    GREEN -> YELLOW
    */

    if (
        phase ===
        "GREEN"
    ) {

        phase =
            "YELLOW";

        timer =
            CONFIG.yellowTime;

        updateSignals();

        return;
    }


    /*
    YELLOW -> OTHER DIRECTION
    */

    selectedAxis =
        selectedAxis === "NS"
            ? "EW"
            : "NS";


    phase =
        "GREEN";

    timer =
        CONFIG.greenTime;


    updateSignals();
}


/* =========================================================
   SPAWN TRAFFIC
========================================================= */

function safeToSpawn(direction) {

    for (
        const car of cars
    ) {

        if (
            car.direction !==
            direction
        ) {
            continue;
        }


        if (
            direction === "N" &&
            car.y < 100
        ) {
            return false;
        }


        if (
            direction === "S" &&
            car.y >
                geometry().height -
                100
        ) {
            return false;
        }


        if (
            direction === "W" &&
            car.x < 100
        ) {
            return false;
        }


        if (
            direction === "E" &&
            car.x >
                geometry().width -
                100
        ) {
            return false;
        }
    }


    return true;
}


function spawnTraffic() {

    if (
        emergencyActive
    ) {
        return;
    }


    if (
        cars.length >=
        CONFIG.maxCars
    ) {
        return;
    }


    const directions = [
        "N",
        "S",
        "W",
        "E"
    ];


    const available =
        directions.filter(
            direction =>
                safeToSpawn(
                    direction
                )
        );


    if (
        available.length === 0
    ) {
        return;
    }


    /*
    Random traffic.
    */

    const direction =
        available[
            Math.floor(
                Math.random() *
                available.length
            )
        ];


    createCar(
        direction
    );
}


/* =========================================================
   EMERGENCY
========================================================= */

function triggerEmergency() {

    if (
        emergencyActive
    ) {
        return;
    }


    emergencyActive =
        true;


    /*
    ALL NORMAL TRAFFIC STOPS.
    */

    cars.forEach(
        car => {
            car.wait += 0.1;
        }
    );


    /*
    Show ambulance.
    */

    if (
        emergencyCar
    ) {

        const g =
            geometry();


        emergencyCar.hidden =
            false;


        emergencyCar.style.left =
            `${g.centerX + 30}px`;


        emergencyCar.style.top =
            `${g.height - 20}px`;


        emergencyCar.style.transform =
            "translate(-50%, -50%) rotate(-90deg)";
    }


    /*
    Status.
    */

    if (
        emergencyStatus
    ) {

        emergencyStatus.innerHTML =
            "Emergency Vehicle: <strong>ACTIVE — ALL TRAFFIC STOPPED</strong>";
    }


    updateSignals();


    /*
    Emergency duration.
    */

    setTimeout(
        endEmergency,
        7000
    );
}


/* =========================================================
   END EMERGENCY
========================================================= */

function endEmergency() {

    emergencyActive =
        false;


    if (
        emergencyCar
    ) {

        emergencyCar.hidden =
            true;
    }


    if (
        emergencyStatus
    ) {

        emergencyStatus.innerHTML =
            "Emergency Vehicle: <strong>NONE</strong>";
    }


    phase =
        "GREEN";

    timer =
        CONFIG.greenTime;


    updateSignals();
}


/* =========================================================
   UPDATE EMERGENCY VEHICLE
========================================================= */

function updateEmergency(dt) {

    if (
        !emergencyActive ||
        !emergencyCar ||
        emergencyCar.hidden
    ) {
        return;
    }


    const currentTop =
        parseFloat(
            emergencyCar.style.top
        );


    if (
        Number.isNaN(
            currentTop
        )
    ) {
        return;
    }


    const newTop =
        currentTop -
        120 * dt;


    emergencyCar.style.top =
        `${newTop}px`;


    if (
        newTop < -60
    ) {

        emergencyCar.hidden =
            true;
    }
}


/* =========================================================
   METRICS
========================================================= */

function updateMetrics() {

    const ns =
        cars.filter(
            car =>
                car.direction === "N" ||
                car.direction === "S"
        );


    const ew =
        cars.filter(
            car =>
                car.direction === "E" ||
                car.direction === "W"
        );


    const nsWaiting =
        ns.filter(
            car =>
                car.wait > 0.5
        );


    const ewWaiting =
        ew.filter(
            car =>
                car.wait > 0.5
        );


    const waitNS =
        ns.length
            ? ns.reduce(
                (
                    total,
                    car
                ) =>
                    total +
                    car.wait,
                0
            ) / ns.length
            : 0;


    const waitEW =
        ew.length
            ? ew.reduce(
                (
                    total,
                    car
                ) =>
                    total +
                    car.wait,
                0
            ) / ew.length
            : 0;


    const queue =
        cars.length;


    const waiting =
        nsWaiting.length +
        ewWaiting.length;


    const congestion =
        Math.min(
            100,
            cars.length * 4 +
            waiting * 2
        );


    if (
        vehiclesNS
    ) {

        vehiclesNS.textContent =
            ns.length;
    }


    if (
        vehiclesEW
    ) {

        vehiclesEW.textContent =
            ew.length;
    }


    if (
        avgWaitNS
    ) {

        avgWaitNS.textContent =
            waitNS.toFixed(1) +
            "s";
    }


    if (
        avgWaitEW
    ) {

        avgWaitEW.textContent =
            waitEW.toFixed(1) +
            "s";
    }


    if (
        throughputEl
    ) {

        throughputEl.textContent =
            throughput;
    }


    if (
        congestionEl
    ) {

        if (
            congestion >= 60
        ) {

            congestionEl.textContent =
                "HIGH";

        } else if (
            congestion >= 25
        ) {

            congestionEl.textContent =
                "MEDIUM";

        } else {

            congestionEl.textContent =
                "LOW";
        }
    }


    if (
        queueScore
    ) {

        queueScore.textContent =
            (
                queue * 3
            ).toFixed(1);
    }


    if (
        waitingScore
    ) {

        waitingScore.textContent =
            (
                waiting * 0.5
            ).toFixed(1);
    }


    if (
        congestionScore
    ) {

        congestionScore.textContent =
            (
                congestion * 0.2
            ).toFixed(1);
    }


    if (
        selectedDirection
    ) {

        selectedDirection.textContent =
            emergencyActive
                ? "EMERGENCY"
                : selectedAxis;
    }


    if (
        signalTimer
    ) {

        signalTimer.textContent =
            emergencyActive
                ? "STOP"
                : Math.max(
                    0,
                    Math.ceil(timer)
                );
    }


    if (
        currentPhase
    ) {

        currentPhase.textContent =
            emergencyActive
                ? "EMERGENCY STOP"
                : phase;
    }


    /*
    Bars.
    */

    if (
        nsBar
    ) {

        nsBar.style.width =
            Math.min(
                100,
                ns.length * 10
            ) + "%";
    }


    if (
        ewBar
    ) {

        ewBar.style.width =
            Math.min(
                100,
                ew.length * 10
            ) + "%";
    }


    if (
        throughputBar
    ) {

        throughputBar.style.width =
            Math.min(
                100,
                throughput
            ) + "%";
    }
}


/* =========================================================
   INITIAL TRAFFIC
========================================================= */

function createInitialTraffic() {

    /*
    One car on each incoming lane,
    with enough separation.
    */

    createCar("N", 0);
    createCar("N", 130);

    createCar("S", 0);
    createCar("S", 130);

    createCar("W", 0);
    createCar("W", 130);

    createCar("E", 0);
    createCar("E", 130);
}


/* =========================================================
   BUTTON
========================================================= */

if (
    emergencyBtn
) {

    emergencyBtn.addEventListener(
        "click",
        triggerEmergency
    );
}


/* =========================================================
   START
========================================================= */

createInitialTraffic();

updateSignals();

updateMetrics();


/* =========================================================
   MAIN LOOP
========================================================= */

function loop(now) {

    const dt =
        Math.min(
            0.05,
            (
                now -
                lastTime
            ) / 1000
        );


    lastTime =
        now;


    /*
    Signal controller.
    */

    updateSignal(dt);


    /*
    Spawn new traffic.
    */

    spawnClock += dt;


    if (
        spawnClock >=
        CONFIG.spawnInterval
    ) {

        spawnClock = 0;

        spawnTraffic();
    }


    /*
    Update cars.
    */

    /*
    Sort each lane so the
    front car is updated first.
    */

    const directions = [
        "N",
        "S",
        "W",
        "E"
    ];


    for (
        const direction of directions
    ) {

        const laneCars =
            cars
                .filter(
                    car =>
                        car.direction ===
                        direction
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        progress(b) -
                        progress(a)
                );


        for (
            const car of laneCars
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
    Hard safety layer.
    */

    enforceSafety();


    /*
    Emergency.
    */

    updateEmergency(dt);


    /*
    UI.
    */

    updateSignals();

    updateMetrics();


    requestAnimationFrame(
        loop
    );
}


requestAnimationFrame(
    loop
);
