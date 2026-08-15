"use strict";

/*
=========================================================
 CITYFLOW
 Intelligent Adaptive Traffic Management

 FEATURES
 - 🚗 actual car emoji
 - 🚑 emergency vehicle
 - 4 independent traffic lanes
 - NS / EW signal control
 - RED / YELLOW / GREEN phases
 - Fixed lane positions
 - Proper stop lines
 - Physical safety gap
 - No same-lane car overlap
 - Emergency vehicle stops ALL normal traffic
 - Traffic metrics
=========================================================
*/


/* =====================================================
   CONFIGURATION
===================================================== */

const CONFIG = {

    CAR_WIDTH: 42,
    CAR_HEIGHT: 32,

    SAFETY_GAP: 30,

    SPEED: 90,

    EMERGENCY_SPEED: 120,

    GREEN_TIME: 8,

    YELLOW_TIME: 2,

    SPAWN_INTERVAL: 2200,

    MAX_CARS: 20,

    INITIAL_CARS: 3,

    INITIAL_GAP: 105,

    EMERGENCY_DURATION: 7000
};


/* =====================================================
   STATE
===================================================== */

let cars = [];

let nextCarId = 1;

let selectedDirection = "NS";

let signalPhase = "GREEN";

let signalTimer = CONFIG.GREEN_TIME;

let emergencyActive = false;

let emergencyVehicle = null;

let throughput = 0;

let spawnTimer = 0;

let lastTime = performance.now();


/* =====================================================
   DOM
===================================================== */

const intersection =
    document.getElementById("intersection");

const carsLayer =
    document.getElementById("cars");

const emergencyButton =
    document.getElementById("emergencyBtn");


/* =====================================================
   DASHBOARD
===================================================== */

const nsCountEl =
    document.getElementById("nsCount");

const ewCountEl =
    document.getElementById("ewCount");

const avgNSEl =
    document.getElementById("avgNS");

const avgEWEl =
    document.getElementById("avgEW");

const throughputEl =
    document.getElementById("throughput");

const congestionEl =
    document.getElementById("congestion");

const queueScoreEl =
    document.getElementById("queueScore");

const waitingScoreEl =
    document.getElementById("waitingScore");

const congestionScoreEl =
    document.getElementById("congestionScore");

const selectedDirectionEl =
    document.getElementById("selectedDirection");

const signalTimerEl =
    document.getElementById("signalTimer");

const phaseStatusEl =
    document.getElementById("phaseStatus");

const emergencyStatusEl =
    document.getElementById("emergencyStatus");

const priorityStatusEl =
    document.getElementById("priorityStatus");

const nsStatusEl =
    document.getElementById("nsStatus");

const ewStatusEl =
    document.getElementById("ewStatus");

const queueNSEl =
    document.getElementById("queueNS");

const queueEWEl =
    document.getElementById("queueEW");

const congNSEl =
    document.getElementById("congNS");

const congEWEl =
    document.getElementById("congEW");


/* =====================================================
   SAFETY CHECK
===================================================== */

if (!intersection || !carsLayer) {

    throw new Error(
        "CityFlow: intersection or cars layer missing."
    );
}


/* =====================================================
   GEOMETRY
===================================================== */

function getGeometry() {

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
            width * 0.38,

        roadRight:
            width * 0.62,

        roadTop:
            height * 0.38,

        roadBottom:
            height * 0.62,

        northStop:
            height * 0.40,

        southStop:
            height * 0.60,

        westStop:
            width * 0.40,

        eastStop:
            width * 0.60
    };
}


/* =====================================================
   LANE POSITIONS
=====================================================

 N = enters from NORTH, moves DOWN
 S = enters from SOUTH, moves UP
 W = enters from WEST, moves RIGHT
 E = enters from EAST, moves LEFT

===================================================== */

function getLanePosition(direction) {

    const g =
        getGeometry();

    const laneOffset = 30;

    if (direction === "N") {

        return {
            x:
                g.centerX - laneOffset,
            y: 0
        };
    }

    if (direction === "S") {

        return {
            x:
                g.centerX + laneOffset,
            y: 0
        };
    }

    if (direction === "W") {

        return {
            x: 0,
            y:
                g.centerY - laneOffset
        };
    }

    return {

        x: 0,

        y:
            g.centerY + laneOffset
    };
}


/* =====================================================
   DIRECTION HELPERS
===================================================== */

function isPositiveDirection(direction) {

    return (
        direction === "N" ||
        direction === "W"
    );
}


function isVertical(direction) {

    return (
        direction === "N" ||
        direction === "S"
    );
}


function axisOf(direction) {

    return (
        direction === "N" ||
        direction === "S"
    )
        ? "NS"
        : "EW";
}


function vehicleLength(direction) {

    return isVertical(direction)
        ? CONFIG.CAR_HEIGHT
        : CONFIG.CAR_WIDTH;
}


/* =====================================================
   STOP LINE POSITION
===================================================== */

function getStopPosition(direction) {

    const g =
        getGeometry();

    /*
    Position is the TOP/LEFT coordinate
    of the car.
    */

    if (direction === "N") {

        return (
            g.northStop -
            CONFIG.CAR_HEIGHT -
            10
        );
    }


    if (direction === "S") {

        return (
            g.southStop +
            10
        );
    }


    if (direction === "W") {

        return (
            g.westStop -
            CONFIG.CAR_WIDTH -
            10
        );
    }


    return (
        g.eastStop +
        10
    );
}


/* =====================================================
   PROGRESS

   Larger progress = further along the road.
===================================================== */

function getProgress(car) {

    if (car.direction === "N") {

        return car.y;
    }

    if (car.direction === "S") {

        return -car.y;
    }

    if (car.direction === "W") {

        return car.x;
    }

    return -car.x;
}


/* =====================================================
   CREATE CAR ELEMENT
===================================================== */

function createCarElement(direction) {

    const element =
        document.createElement("div");

    element.className =
        "traffic-car";

    element.innerHTML =
        '<span class="car-emoji">🚗</span>';

    /*
    Emoji naturally faces RIGHT.

    N = moving DOWN  -> rotate 90
    S = moving UP    -> rotate -90
    W = moving RIGHT -> rotate 0
    E = moving LEFT  -> rotate 180
    */

    let rotation = 0;

    if (direction === "N") {

        rotation = 90;
    }

    else if (direction === "S") {

        rotation = -90;
    }

    else if (direction === "W") {

        rotation = 0;
    }

    else if (direction === "E") {

        rotation = 180;
    }

    element.dataset.rotation =
        rotation;

    return element;
}


/* =====================================================
   CREATE CAR
===================================================== */

function createCar(
    direction,
    distanceFromEntry = 0
) {

    if (
        cars.length >=
        CONFIG.MAX_CARS
    ) {

        return null;
    }


    const g =
        getGeometry();

    const lane =
        getLanePosition(direction);

    const car = {

        id:
            nextCarId++,

        direction,

        axis:
            axisOf(direction),

        x:
            lane.x,

        y:
            lane.y,

        wait:
            0,

        stopped:
            false,

        crossedStop:
            false,

        element:
            createCarElement(direction)
    };


    /*
    ============================================
    INITIAL POSITION
    ============================================
    */

    if (direction === "N") {

        car.x =
            lane.x -
            CONFIG.CAR_WIDTH / 2;

        car.y =
            -CONFIG.CAR_HEIGHT -
            distanceFromEntry;
    }


    else if (direction === "S") {

        car.x =
            lane.x -
            CONFIG.CAR_WIDTH / 2;

        car.y =
            g.height +
            distanceFromEntry;
    }


    else if (direction === "W") {

        car.x =
            -CONFIG.CAR_WIDTH -
            distanceFromEntry;

        car.y =
            lane.y -
            CONFIG.CAR_HEIGHT / 2;
    }


    else {

        car.x =
            g.width +
            distanceFromEntry;

        car.y =
            lane.y -
            CONFIG.CAR_HEIGHT / 2;
    }


    /*
    ADD TO DOM
    */

    carsLayer.appendChild(
        car.element
    );

    cars.push(car);

    renderCar(car);

    return car;
}


/* =====================================================
   RENDER CAR
===================================================== */

function renderCar(car) {

    if (
        !car ||
        !car.element
    ) {

        return;
    }


    car.element.style.left =
        Math.round(car.x) + "px";

    car.element.style.top =
        Math.round(car.y) + "px";


    const rotation =
        car.element.dataset.rotation ||
        0;

    car.element.style.transform =
        `translate(-50%, -50%) rotate(${rotation}deg)`;
}


/* =====================================================
   GET CAR AHEAD
===================================================== */

function getCarAhead(car) {

    let nearest = null;

    let smallestDistance =
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
            getProgress(other) -
            getProgress(car);


        if (
            distance > 0 &&
            distance <
                smallestDistance
        ) {

            smallestDistance =
                distance;

            nearest =
                other;
        }
    }


    return nearest;
}


/* =====================================================
   SIGNAL ALLOWS MOVEMENT
===================================================== */

function signalAllowsCar(car) {

    /*
    Emergency:
    EVERYTHING STOPS.
    */

    if (emergencyActive) {

        return false;
    }


    /*
    Yellow means no new cars
    enter the intersection.
    */

    if (
        signalPhase !==
        "GREEN"
    ) {

        return false;
    }


    return (
        axisOf(car.direction) ===
        selectedDirection
    );
}


/* =====================================================
   HAS CAR PASSED STOP LINE?
===================================================== */

function hasPassedStop(car) {

    const g =
        getGeometry();


    if (
        car.direction === "N"
    ) {

        return (
            car.y >=
            g.northStop
        );
    }


    if (
        car.direction === "S"
    ) {

        return (
            car.y +
            CONFIG.CAR_HEIGHT <=
            g.southStop
        );
    }


    if (
        car.direction === "W"
    ) {

        return (
            car.x >=
            g.westStop
        );
    }


    return (
        car.x +
        CONFIG.CAR_WIDTH <=
        g.eastStop
    );
}


/* =====================================================
   STOP AT SIGNAL
===================================================== */

function getSignalSafePosition(car) {

    if (
        car.crossedStop
    ) {

        return null;
    }


    if (
        signalAllowsCar(car)
    ) {

        return null;
    }


    return getStopPosition(
        car.direction
    );
}


/* =====================================================
   GET SAFE POSITION BEHIND LEADER
===================================================== */

function getLeaderSafePosition(
    car,
    desiredPosition
) {

    const leader =
        getCarAhead(car);


    if (!leader) {

        return desiredPosition;
    }


    const gap =
        CONFIG.SAFETY_GAP;


    const length =
        vehicleLength(
            car.direction
        );


    /*
    N / W move toward increasing
    coordinates.
    */

    if (
        isPositiveDirection(
            car.direction
        )
    ) {

        const maximum =
            getProgress(leader) -
            length -
            gap;

        return Math.min(
            desiredPosition,
            maximum
        );
    }


    /*
    S / E move toward decreasing
    coordinates.
    */

    const maximum =
        (
            car.direction === "S"
                ? leader.y +
                  CONFIG.CAR_HEIGHT +
                  gap
                : leader.x +
                  CONFIG.CAR_WIDTH +
                  gap
        );


    return Math.max(
        desiredPosition,
        maximum
    );
}


/* =====================================================
   UPDATE CAR
===================================================== */

function updateCar(
    car,
    dt
) {

    if (
        !car ||
        !car.element
    ) {

        return;
    }


    /*
    ============================================
    EMERGENCY MODE
    ============================================
    */

    if (
        emergencyActive
    ) {

        car.stopped =
            true;

        car.wait +=
            dt;

        renderCar(car);

        return;
    }


    /*
    ============================================
    CURRENT POSITION
    ============================================
    */

    const oldPosition =
        isVertical(car.direction)
            ? car.y
            : car.x;


    /*
    ============================================
    DESIRED MOVEMENT
    ============================================
    */

    const movement =
        CONFIG.SPEED *
        dt;


    let desired =
        oldPosition;


    if (
        isPositiveDirection(
            car.direction
        )
    ) {

        desired +=
            movement;

    }

    else {

        desired -=
            movement;
    }


    /*
    ============================================
    STOP LINE
    ============================================
    */

    const signalStop =
        getSignalSafePosition(
            car
        );


    if (
        signalStop !== null
    ) {

        if (
            isPositiveDirection(
                car.direction
            )
        ) {

            desired =
                Math.min(
                    desired,
                    signalStop
                );

        }

        else {

            desired =
                Math.max(
                    desired,
                    signalStop
                );
        }
    }


    /*
    ============================================
    SAFETY GAP
    ============================================
    */

    desired =
        getLeaderSafePosition(
            car,
            desired
        );


    /*
    ============================================
    NEVER MOVE BACKWARD
    ============================================
    */

    let newPosition;


    if (
        isPositiveDirection(
            car.direction
        )
    ) {

        newPosition =
            Math.max(
                oldPosition,
                desired
            );

    }

    else {

        newPosition =
            Math.min(
                oldPosition,
                desired
            );
    }


    /*
    ============================================
    APPLY POSITION
    ============================================
    */

    if (
        isVertical(
            car.direction
        )
    ) {

        car.y =
            newPosition;

    }

    else {

        car.x =
            newPosition;
    }


    /*
    ============================================
    STOP STATUS
    ============================================
    */

    car.stopped =
        Math.abs(
            newPosition -
            oldPosition
        ) < 0.05;


    if (
        car.stopped
    ) {

        car.wait +=
            dt;

    }

    else {

        /*
        Slowly reduce waiting time
        once vehicle moves.
        */

        car.wait *=
            0.98;
    }


    /*
    ============================================
    STOP LINE PASSED
    ============================================
    */

    if (
        hasPassedStop(car)
    ) {

        car.crossedStop =
            true;
    }


    renderCar(car);


    /*
    ============================================
    REMOVE CAR AFTER EXIT
    ============================================
    */

    const g =
        getGeometry();


    if (
        car.direction === "N" &&
        car.y >
            g.height + 80
    ) {

        removeCar(car);

        return;
    }


    if (
        car.direction === "S" &&
        car.y <
            -100
    ) {

        removeCar(car);

        return;
    }


    if (
        car.direction === "W" &&
        car.x >
            g.width + 80
    ) {

        removeCar(car);

        return;
    }


    if (
        car.direction === "E" &&
        car.x <
            -100
    ) {

        removeCar(car);

        return;
    }
}


/* =====================================================
   REMOVE CAR
===================================================== */

function removeCar(car) {

    if (
        car.element
    ) {

        car.element.remove();
    }


    cars =
        cars.filter(
            c => c !== car
        );


    throughput++;
}


/* =====================================================
   INITIAL TRAFFIC
===================================================== */

function createInitialTraffic() {

    /*
    Three cars per lane.
    They begin with a large gap.
    */

    for (
        let i = 0;
        i < CONFIG.INITIAL_CARS;
        i++
    ) {

        const distance =
            i *
            CONFIG.INITIAL_GAP;


        createCar(
            "N",
            distance
        );


        createCar(
            "S",
            distance
        );


        createCar(
            "W",
            distance
        );


        createCar(
            "E",
            distance
        );
    }
}


/* =====================================================
   SPAWN SAFETY CHECK
===================================================== */

function canSpawn(direction) {

    const g =
        getGeometry();


    for (
        const car of cars
    ) {

        if (
            car.direction !==
            direction
        ) {

            continue;
        }


        /*
        Check entrance region.
        */

        if (
            direction === "N"
        ) {

            if (
                car.y <
                100
            ) {

                return false;
            }
        }


        else if (
            direction === "S"
        ) {

            if (
                car.y >
                g.height - 100
            ) {

                return false;
            }
        }


        else if (
            direction === "W"
        ) {

            if (
                car.x <
                100
            ) {

                return false;
            }
        }


        else {

            if (
                car.x >
                g.width - 100
            ) {

                return false;
            }
        }
    }


    return true;
}


/* =====================================================
   SPAWN TRAFFIC
===================================================== */

function spawnTraffic() {

    if (
        emergencyActive
    ) {

        return;
    }


    if (
        cars.length >=
        CONFIG.MAX_CARS
    ) {

        return;
    }


    const directions = [
        "N",
        "S",
        "W",
        "E"
    ];


    /*
    Prefer the direction with
    fewer vehicles.
    */

    const counts = {

        N: 0,
        S: 0,
        W: 0,
        E: 0
    };


    for (
        const car of cars
    ) {

        counts[
            car.direction
        ]++;
    }


    const available =
        directions.filter(
            direction =>
                canSpawn(
                    direction
                )
        );


    if (
        available.length === 0
    ) {

        return;
    }


    available.sort(
        (a, b) =>
            counts[a] -
            counts[b]
    );


    const direction =
        available[0];


    createCar(
        direction,
        0
    );
}


/* =====================================================
   SIGNAL LIGHT HELPERS
===================================================== */

function setLight(
    id,
    active
) {

    const element =
        document.getElementById(id);

    if (!element) {

        return;
    }


    element.classList.toggle(
        "active",
        active
    );
}


/* =====================================================
   UPDATE SIGNAL LIGHTS
===================================================== */

function updateSignalLights() {

    const allLights = [
        "nRed",
        "nYellow",
        "nGreen",
        "sRed",
        "sYellow",
        "sGreen",
        "eRed",
        "eYellow",
        "eGreen",
        "wRed",
        "wYellow",
        "wGreen"
    ];


    /*
    First turn everything off.
    */

    allLights.forEach(
        id =>
            setLight(
                id,
                false
            )
    );


    /*
    EMERGENCY:
    all signals RED.
    */

    if (
        emergencyActive
    ) {

        setLight(
            "nRed",
            true
        );

        setLight(
            "sRed",
            true
        );

        setLight(
            "eRed",
            true
        );

        setLight(
            "wRed",
            true
        );

        return;
    }


    /*
    NS selected.
    */

    if (
        selectedDirection ===
        "NS"
    ) {

        if (
            signalPhase ===
            "GREEN"
        ) {

            setLight(
                "nGreen",
                true
            );

            setLight(
                "sGreen",
                true
            );

            setLight(
                "eRed",
                true
            );

            setLight(
                "wRed",
                true
            );
        }


        else {

            setLight(
                "nYellow",
                true
            );

            setLight(
                "sYellow",
                true
            );

            setLight(
                "eRed",
                true
            );

            setLight(
                "wRed",
                true
            );
        }

        return;
    }


    /*
    EW selected.
    */

    if (
        signalPhase ===
        "GREEN"
    ) {

        setLight(
            "eGreen",
            true
        );

        setLight(
            "wGreen",
            true
        );

        setLight(
            "nRed",
            true
        );

        setLight(
            "sRed",
            true
        );

    }

    else {

        setLight(
            "eYellow",
            true
        );

        setLight(
            "wYellow",
            true
        );

        setLight(
            "nRed",
            true
        );

        setLight(
            "sRed",
            true
        );
    }
}


/* =====================================================
   UPDATE SIGNAL TIMER
===================================================== */

function updateSignal(
    dt
) {

    if (
        emergencyActive
    ) {

        return;
    }


    signalTimer -=
        dt;


    if (
        signalTimer > 0
    ) {

        return;
    }


    /*
    GREEN -> YELLOW
    */

    if (
        signalPhase ===
        "GREEN"
    ) {

        signalPhase =
            "YELLOW";

        signalTimer =
            CONFIG.YELLOW_TIME;

        updateSignalLights();

        return;
    }


    /*
    YELLOW -> OTHER DIRECTION
    */

    selectedDirection =
        selectedDirection === "NS"
            ? "EW"
            : "NS";


    signalPhase =
        "GREEN";

    signalTimer =
        CONFIG.GREEN_TIME;


    updateSignalLights();
}


/* =====================================================
   EMERGENCY VEHICLE
===================================================== */

function createEmergencyVehicle() {

    if (
        emergencyVehicle
    ) {

        return;
    }


    const g =
        getGeometry();


    const ambulance =
        document.createElement(
            "div"
        );


    ambulance.className =
        "emergency-car";


    ambulance.textContent =
        "🚑";


    ambulance.style.position =
        "absolute";


    ambulance.style.width =
        "42px";


    ambulance.style.height =
        "32px";


    ambulance.style.fontSize =
        "30px";


    ambulance.style.lineHeight =
        "32px";


    ambulance.style.textAlign =
        "center";


    ambulance.style.zIndex =
        "100";


    /*
    Start from SOUTH.
    Move NORTH.
    */

    ambulance.style.left =
        (
            g.centerX +
            30
        ) + "px";


    ambulance.style.top =
        (
            g.height +
            40
        ) + "px";


    ambulance.style.transform =
        "translate(-50%, -50%) rotate(-90deg)";


    carsLayer.appendChild(
        ambulance
    );


    emergencyVehicle = {

        element:
            ambulance,

        x:
            g.centerX + 30,

        y:
            g.height + 40
    };
}


/* =====================================================
   TRIGGER EMERGENCY
===================================================== */

function triggerEmergency() {

    if (
        emergencyActive
    ) {

        return;
    }


    emergencyActive =
        true;


    createEmergencyVehicle();


    /*
    Freeze every normal car.
    */

    for (
        const car of cars
    ) {

        car.stopped =
            true;
    }


    /*
    Emergency status.
    */

    if (
        emergencyStatusEl
    ) {

        emergencyStatusEl.textContent =
            "ACTIVE — ALL TRAFFIC STOPPED";

        emergencyStatusEl.className =
            "status-active";
    }


    if (
        priorityStatusEl
    ) {

        priorityStatusEl.textContent =
            "EMERGENCY ACTIVE";

        priorityStatusEl.className =
            "status-active";
    }


    updateSignalLights();


    /*
    End emergency after
    configured duration.
    */

    setTimeout(
        endEmergency,
        CONFIG.EMERGENCY_DURATION
    );
}


/* =====================================================
   END EMERGENCY
===================================================== */

function endEmergency() {

    emergencyActive =
        false;


    if (
        emergencyVehicle
    ) {

        if (
            emergencyVehicle.element
        ) {

            emergencyVehicle
                .element
                .remove();
        }


        emergencyVehicle =
            null;
    }


    if (
        emergencyStatusEl
    ) {

        emergencyStatusEl.textContent =
            "NONE";

        emergencyStatusEl.className =
            "";
    }


    if (
        priorityStatusEl
    ) {

        priorityStatusEl.textContent =
            "STANDBY";

        priorityStatusEl.className =
            "status-none";
    }


    /*
    Restart the selected signal.
    */

    signalPhase =
        "GREEN";

    signalTimer =
        CONFIG.GREEN_TIME;


    updateSignalLights();
}


/* =====================================================
   UPDATE EMERGENCY VEHICLE
===================================================== */

function updateEmergency(
    dt
) {

    if (
        !emergencyActive ||
        !emergencyVehicle
    ) {

        return;
    }


    const g =
        getGeometry();


    emergencyVehicle.y -=
        CONFIG.EMERGENCY_SPEED *
        dt;


    emergencyVehicle.element.style.top =
        Math.round(
            emergencyVehicle.y
        ) + "px";


    /*
    Emergency vehicle exits
    from the top.
    */

    if (
        emergencyVehicle.y <
        -60
    ) {

        if (
            emergencyVehicle.element
        ) {

            emergencyVehicle
                .element
                .remove();
        }


        emergencyVehicle =
            null;
    }
}


/* =====================================================
   WAITING METRICS
===================================================== */

function averageWait(
    list
) {

    if (
        list.length === 0
    ) {

        return 0;
    }


    let total = 0;


    for (
        const car of list
    ) {

        total +=
            car.wait;
    }


    return (
        total /
        list.length
    );
}


/* =====================================================
   UPDATE METRICS
===================================================== */

function updateMetrics() {

    const nsCars =
        cars.filter(
            car =>
                car.axis ===
                "NS"
        );


    const ewCars =
        cars.filter(
            car =>
                car.axis ===
                "EW"
        );


    const nsWaiting =
        nsCars.filter(
            car =>
                car.stopped
        );


    const ewWaiting =
        ewCars.filter(
            car =>
                car.stopped
        );


    const nsWait =
        averageWait(
            nsCars
        );


    const ewWait =
        averageWait(
            ewCars
        );


    const queueScore =
        cars.length * 3;


    const waitingScore =
        (
            nsWaiting.length +
            ewWaiting.length
        ) * 0.5;


    const congestionScore =
        Math.min(
            100,
            (
                cars.length * 1.8
            ) +
            (
                (
                    nsWaiting.length +
                    ewWaiting.length
                ) * 0.7
            )
        );


    /*
    TOP STATISTICS
    */

    if (
        nsCountEl
    ) {

        nsCountEl.textContent =
            nsCars.length;
    }


    if (
        ewCountEl
    ) {

        ewCountEl.textContent =
            ewCars.length;
    }


    if (
        avgNSEl
    ) {

        avgNSEl.textContent =
            nsWait.toFixed(1) +
            "s";
    }


    if (
        avgEWEl
    ) {

        avgEWEl.textContent =
            ewWait.toFixed(1) +
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
            congestionScore >=
            35
        ) {

            congestionEl.textContent =
                "HIGH";
        }

        else if (
            congestionScore >=
            18
        ) {

            congestionEl.textContent =
                "MEDIUM";
        }

        else {

            congestionEl.textContent =
                "LOW";
        }
    }


    /*
    RL METRICS
    */

    if (
        queueScoreEl
    ) {

        queueScoreEl.textContent =
            queueScore.toFixed(1);
    }


    if (
        waitingScoreEl
    ) {

        waitingScoreEl.textContent =
            waitingScore.toFixed(1);
    }


    if (
        congestionScoreEl
    ) {

        congestionScoreEl.textContent =
            congestionScore.toFixed(1);
    }


    if (
        selectedDirectionEl
    ) {

        selectedDirectionEl.textContent =
            emergencyActive
                ? "ALL STOP"
                : selectedDirection;
    }


    if (
        signalTimerEl
    ) {

        signalTimerEl.textContent =
            emergencyActive
                ? "STOPPED"
                : Math.max(
                    0,
                    Math.ceil(
                        signalTimer
                    )
                ) +
                " seconds";
    }


    if (
        phaseStatusEl
    ) {

        phaseStatusEl.textContent =
            emergencyActive
                ? "EMERGENCY STOP"
                : signalPhase;
    }


    /*
    BOTTOM STATUS
    */

    if (
        nsStatusEl
    ) {

        if (
            emergencyActive
        ) {

            nsStatusEl.textContent =
                "RED";

            nsStatusEl.className =
                "signal-status red";

        }

        else if (
            selectedDirection ===
            "NS"
        ) {

            nsStatusEl.textContent =
                signalPhase;

            nsStatusEl.className =
                "signal-status " +
                signalPhase.toLowerCase();

        }

        else {

            nsStatusEl.textContent =
                "RED";

            nsStatusEl.className =
                "signal-status red";
        }
    }


    if (
        ewStatusEl
    ) {

        if (
            emergencyActive
        ) {

            ewStatusEl.textContent =
                "RED";

            ewStatusEl.className =
                "signal-status red";

        }

        else if (
            selectedDirection ===
            "EW"
        ) {

            ewStatusEl.textContent =
                signalPhase;

            ewStatusEl.className =
                "signal-status " +
                signalPhase.toLowerCase();

        }

        else {

            ewStatusEl.textContent =
                "RED";

            ewStatusEl.className =
                "signal-status red";
        }
    }


    if (
        queueNSEl
    ) {

        queueNSEl.textContent =
            nsWaiting.length;
    }


    if (
        queueEWEl
    ) {

        queueEWEl.textContent =
            ewWaiting.length;
    }


    if (
        congNSEl
    ) {

        congNSEl.textContent =
            nsCars.length >= 6
                ? "HIGH"
                : nsCars.length >= 3
                    ? "MEDIUM"
                    : "LOW";
    }


    if (
        congEWEl
    ) {

        congEWEl.textContent =
            ewCars.length >= 6
                ? "HIGH"
                : ewCars.length >= 3
                    ? "MEDIUM"
                    : "LOW";
    }
}


/* =====================================================
   HARD SAFETY CHECK
=====================================================

This is an additional collision-prevention layer.

Even if something unexpected happens in the
movement calculation, cars on the SAME lane
are forced apart.

===================================================== */

function enforceSafetyGaps() {

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
                        getProgress(b) -
                        getProgress(a)
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
                isPositiveDirection(
                    direction
                )
            ) {

                const minimum =
                    front.y +
                    CONFIG.CAR_HEIGHT +
                    CONFIG.SAFETY_GAP;


                if (
                    back.y <
                    minimum
                ) {

                    back.y =
                        minimum;
                }
            }


            else if (
                direction === "S"
            ) {

                const maximum =
                    front.y -
                    CONFIG.SAFETY_GAP -
                    CONFIG.CAR_HEIGHT;


                if (
                    back.y >
                    maximum
                ) {

                    back.y =
                        maximum;
                }
            }


            else if (
                direction === "W"
            ) {

                const minimum =
                    front.x +
                    CONFIG.CAR_WIDTH +
                    CONFIG.SAFETY_GAP;


                if (
                    back.x <
                    minimum
                ) {

                    back.x =
                        minimum;
                }
            }


            else {

                const maximum =
                    front.x -
                    CONFIG.SAFETY_GAP -
                    CONFIG.CAR_WIDTH;


                if (
                    back.x >
                    maximum
                ) {

                    back.x =
                        maximum;
                }
            }


            renderCar(
                back
            );
        }
    }
}


/* =====================================================
   EMERGENCY BUTTON
===================================================== */

if (
    emergencyButton
) {

    emergencyButton.addEventListener(
        "click",
        triggerEmergency
    );
}


/* =====================================================
   INITIAL TRAFFIC
===================================================== */

createInitialTraffic();


/* =====================================================
   INITIAL SIGNAL
===================================================== */

updateSignalLights();

updateMetrics();


/* =====================================================
   MAIN ANIMATION LOOP
===================================================== */

function animationLoop(
    currentTime
) {

    const delta =
        Math.min(
            0.05,
            (
                currentTime -
                lastTime
            ) / 1000
        );


    lastTime =
        currentTime;


    /*
    ============================================
    SIGNAL
    ============================================
    */

    updateSignal(
        delta
    );


    /*
    ============================================
    SPAWN
    ============================================
    */

    spawnTimer +=
        delta;


    if (
        spawnTimer >=
        CONFIG.SPAWN_INTERVAL /
        1000
    ) {

        spawnTimer =
            0;

        spawnTraffic();
    }


    /*
    ============================================
    UPDATE NORMAL CARS
    ============================================
    */

    /*
    Front cars are updated first.

    This is very important because the
    vehicle behind needs to see the
    vehicle in front's latest position.
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
                        getProgress(b) -
                        getProgress(a)
                );


        for (
            const car of laneCars
        ) {

            if (
                cars.includes(car)
            ) {

                updateCar(
                    car,
                    delta
                );
            }
        }
    }


    /*
    ============================================
    HARD COLLISION PROTECTION
    ============================================
    */

    enforceSafetyGaps();


    /*
    ============================================
    EMERGENCY
    ============================================
    */

    updateEmergency(
        delta
    );


    /*
    ============================================
    UI
    ============================================
    */

    updateSignalLights();

    updateMetrics();


    /*
    ============================================
    NEXT FRAME
    ============================================
    */

    requestAnimationFrame(
        animationLoop
    );
}


/* =====================================================
   START
===================================================== */

requestAnimationFrame(
    animationLoop
);
