(() => {
"use strict";

const intersection = document.getElementById("intersection");
const layer = document.getElementById("cars");
const emergencyEl = document.getElementById("emergencyCar");

const ui = {
  ns: document.getElementById("vehiclesNS"), ew: document.getElementById("vehiclesEW"),
  wns: document.getElementById("avgWaitNS"), wew: document.getElementById("avgWaitEW"),
  throughput: document.getElementById("throughput"), congestion: document.getElementById("congestion"),
  q: document.getElementById("queueScore"), w: document.getElementById("waitingScore"),
  c: document.getElementById("congestionScore"), dir: document.getElementById("selectedDirection"),
  timer: document.getElementById("signalTimer"), phase: document.getElementById("currentPhase"),
  status: document.getElementById("emergencyStatus"), nsbar: document.getElementById("nsBar"),
  ewbar: document.getElementById("ewBar"), tpbar: document.getElementById("throughputBar")
};

const CAR_W = 42, CAR_H = 28;
const SAFETY_GAP = 30;
const SPEED = 88;
const MAX_CARS = 20;
const GREEN_TIME = 8;
const YELLOW_TIME = 2;
const EMERGENCY_DURATION = 7;

let cars = [], nextId = 1;
let selected = "NS", phase = "GREEN", timer = GREEN_TIME;
let throughput = 0, emergency = false, emergencyEnd = 0;
let emergencyTop = 0, lastTime = performance.now(), spawnClock = 0;

function dims(){ return {w:intersection.clientWidth,h:intersection.clientHeight}; }
function laneCenterX(e){ const {w}=dims(); return e==="N"?w*.455:e==="S"?w*.545:w*.5; }
function laneCenterY(e){ const {h}=dims(); return e==="W"?h*.455:e==="E"?h*.545:h*.5; }

function createCar(entry, offset=0){
  if(cars.length>=MAX_CARS) return;
  const {w,h}=dims();
  const car={id:nextId++,entry,dir:(entry==="N"||entry==="S")?"NS":"EW",x:0,y:0,wait:0,el:document.createElement("div")};

  if(entry==="N"){car.x=laneCenterX("N")-CAR_W/2;car.y=-CAR_H-offset;}
  if(entry==="S"){car.x=laneCenterX("S")-CAR_W/2;car.y=h+offset;}
  if(entry==="W"){car.x=-CAR_W-offset;car.y=laneCenterY("W")-CAR_H/2;}
  if(entry==="E"){car.x=w+offset;car.y=laneCenterY("E")-CAR_H/2;}

  car.el.className=`traffic-car car-${entry.toLowerCase()}`;
  car.el.innerHTML=`
    <div class="car-visual">
      <div class="car-body"></div>
      <div class="car-cabin"><span class="car-window"></span><span class="car-window two"></span></div>
      <span class="wheel a"></span><span class="wheel b"></span>
      <span class="car-headlight"></span>
    </div>`;
  layer.appendChild(car.el); cars.push(car); render(car);
}

function render(car){
  car.el.style.left=Math.round(car.x)+"px";
  car.el.style.top=Math.round(car.y)+"px";
}

function progress(car){
  if(car.entry==="N") return car.y;
  if(car.entry==="S") return -car.y;
  if(car.entry==="W") return car.x;
  return -car.x;
}

function leaderOf(car){
  let leader=null,best=Infinity;
  for(const other of cars){
    if(other===car||other.entry!==car.entry) continue;
    const d=progress(other)-progress(car);
    if(d>0&&d<best){best=d;leader=other;}
  }
  return leader;
}

function stopLine(car){
  const {w,h}=dims();
  if(car.entry==="N") return h*.35;
  if(car.entry==="S") return h*.65;
  if(car.entry==="W") return w*.35;
  return w*.65;
}

function stopPosition(car){
  const line=stopLine(car);
  if(car.entry==="N") return line-CAR_H-10;
  if(car.entry==="S") return line+10;
  if(car.entry==="W") return line-CAR_W-10;
  return line+10;
}

function passedStop(car){
  const line=stopLine(car);
  if(car.entry==="N") return car.y+CAR_H>=line+2;
  if(car.entry==="S") return car.y<=line-2;
  if(car.entry==="W") return car.x+CAR_W>=line+2;
  return car.x<=line-2;
}

function inIntersection(car){
  const {w,h}=dims(), L=w*.35,R=w*.65,T=h*.35,B=h*.65;
  return car.x+CAR_W>L && car.x<R && car.y+CAR_H>T && car.y<B;
}

function axisOccupied(axis){
  return cars.some(c=>c.dir===axis&&inIntersection(c));
}

function canEnter(car){
  if(emergency) return false;
  if(passedStop(car)) return true;
  if(selected!==car.dir || phase!=="GREEN") return false;

  // Never allow perpendicular traffic to enter an occupied junction.
  const otherAxis=car.dir==="NS"?"EW":"NS";
  return !axisOccupied(otherAxis);
}

function availableMove(car){
  const leader=leaderOf(car);
  if(!leader) return Infinity;
  let gap;
  if(car.entry==="N") gap=leader.y-(car.y+CAR_H);
  else if(car.entry==="S") gap=car.y-(leader.y+CAR_H);
  else if(car.entry==="W") gap=leader.x-(car.x+CAR_W);
  else gap=car.x-(leader.x+CAR_W);
  return gap-SAFETY_GAP;
}

function updateCar(car,dt){
  if(emergency){car.wait+=dt/1000;return;}

  let move=SPEED*dt/1000;
  const safe=availableMove(car);
  if(safe<=0){car.wait+=dt/1000;return;}
  if(safe!==Infinity) move=Math.min(move,safe);

  if(!canEnter(car)&&!passedStop(car)){
    const stop=stopPosition(car);
    let d;
    if(car.entry==="N") d=stop-car.y;
    else if(car.entry==="S") d=car.y-stop;
    else if(car.entry==="W") d=stop-car.x;
    else d=car.x-stop;
    if(d<=0){car.wait+=dt/1000;return;}
    move=Math.min(move,d);
  }

  if(move<=0){car.wait+=dt/1000;return;}

  if(car.entry==="N") car.y+=move;
  else if(car.entry==="S") car.y-=move;
  else if(car.entry==="W") car.x+=move;
  else car.x-=move;

  render(car);

  const {w,h}=dims();
  const outside=car.x<-CAR_W-80||car.x>w+80||car.y<-CAR_H-80||car.y>h+80;
  if(outside){
    throughput++;
    car.el.remove();
    cars=cars.filter(c=>c!==car);
  }
}

function enforceLaneSpacing(){
  for(const dir of ["N","S","W","E"]){
    const lane=cars.filter(c=>c.entry===dir).sort((a,b)=>progress(a)-progress(b));
    for(let i=1;i<lane.length;i++){
      const back=lane[i-1],front=lane[i];
      if(dir==="N"){
        const min=back.y+CAR_H+SAFETY_GAP;
        if(front.y<min){front.y=min;render(front);}
      }else if(dir==="S"){
        const max=back.y-CAR_H-SAFETY_GAP;
        if(front.y>max){front.y=max;render(front);}
      }else if(dir==="W"){
        const min=back.x+CAR_W+SAFETY_GAP;
        if(front.x<min){front.x=min;render(front);}
      }else{
        const max=back.x-CAR_W-SAFETY_GAP;
        if(front.x>max){front.x=max;render(front);}
      }
    }
  }
}

function updateSignal(dt){
  if(emergency) return;
  timer-=dt/1000;
  if(phase==="GREEN"){
    if(timer<=0){phase="YELLOW";timer=YELLOW_TIME;}
    return;
  }
  // Yellow stays until the active axis clears, preventing a conflict.
  if(timer<=0 && !axisOccupied(selected)){
    selected=selected==="NS"?"EW":"NS";
    phase="GREEN";timer=GREEN_TIME;
  }else if(timer<=0){
    timer=.2;
  }
}

function updateSignals(){
  document.querySelectorAll(".signal").forEach(signal=>{
    const direction=signal.dataset.direction;
    const red=signal.querySelector(".red"),yellow=signal.querySelector(".yellow"),green=signal.querySelector(".green");
    red.classList.remove("on");yellow.classList.remove("on");green.classList.remove("on");

    if(emergency){red.classList.add("on");return;}
    if(direction!==selected){red.classList.add("on");return;}
    if(phase==="GREEN") green.classList.add("on"); else yellow.classList.add("on");
  });

  ui.dir.textContent=emergency?"ALL STOP":selected;
  ui.timer.textContent=emergency?"STOP":Math.max(0,Math.ceil(timer));
  ui.phase.textContent=emergency?"EMERGENCY STOP":phase;
}

function updateMetrics(){
  const ns=cars.filter(c=>c.dir==="NS"),ew=cars.filter(c=>c.dir==="EW");
  const waiting=cars.filter(c=>c.wait>.2);
  const avg=list=>list.length?list.reduce((s,c)=>s+c.wait,0)/list.length:0;
  const q=cars.length*3,w=waiting.length*.5,c=Math.min(100,cars.length*1.8+waiting.length*.7);

  ui.ns.textContent=ns.length;ui.ew.textContent=ew.length;
  ui.wns.textContent=avg(ns).toFixed(1)+"s";ui.wew.textContent=avg(ew).toFixed(1)+"s";
  ui.throughput.textContent=throughput;
  ui.congestion.textContent=c>35?"HIGH":c>18?"MEDIUM":"LOW";
  ui.q.textContent=q.toFixed(1);ui.w.textContent=w.toFixed(1);ui.c.textContent=c.toFixed(1);
  ui.nsbar.style.width=Math.min(100,ns.length/MAX_CARS*100)+"%";
  ui.ewbar.style.width=Math.min(100,ew.length/MAX_CARS*100)+"%";
  ui.tpbar.style.width=Math.min(100,throughput)+"%";
}

function triggerEmergency(){
  if(emergency)return;
  emergency=true;
  emergencyEnd=performance.now()+EMERGENCY_DURATION*1000;
  const {h}=dims();
  emergencyTop=h-55;
  emergencyEl.hidden=false;
  emergencyEl.style.left=(laneCenterX("S")-23)+"px";
  emergencyEl.style.top=emergencyTop+"px";
  ui.status.innerHTML='Emergency Vehicle: <strong>ACTIVE — ALL TRAFFIC STOPPED</strong>';
  updateSignals();
}

function updateEmergency(now,dt){
  if(!emergency)return;
  let move=105*dt/1000;
  const leaders=cars.filter(c=>c.entry==="S"&&c.y<emergencyTop).sort((a,b)=>b.y-a.y);
  if(leaders.length){
    const front=leaders[0];
    const allowed=front.y+CAR_H+SAFETY_GAP;
    move=Math.max(0,Math.min(move,emergencyTop-allowed));
  }
  emergencyTop-=move;
  emergencyEl.style.top=Math.round(emergencyTop)+"px";
  if(now>=emergencyEnd){
    emergency=false;emergencyEl.hidden=true;
    ui.status.innerHTML='Emergency Vehicle: <strong>NONE</strong>';
    updateSignals();
  }
}

document.getElementById("emergencyBtn").addEventListener("click",triggerEmergency);

// Initial traffic: deliberately visible and separated.
createCar("N",0);createCar("N",90);
createCar("S",0);createCar("S",90);
createCar("W",0);createCar("W",90);
createCar("E",0);createCar("E",90);

function spawnTraffic(){
  if(emergency||cars.length>=MAX_CARS)return;
  const entries=["N","S","W","E"],entry=entries[Math.floor(Math.random()*entries.length)];
  const {w,h}=dims();
  const tooClose=cars.some(c=>{
    if(c.entry!==entry)return false;
    if(entry==="N")return c.y<150;
    if(entry==="S")return c.y>h-150;
    if(entry==="W")return c.x<150;
    return c.x>w-150;
  });
  if(!tooClose)createCar(entry,0);
}

function loop(now){
  const dt=Math.min(40,Math.max(0,now-lastTime));lastTime=now;
  spawnClock+=dt;
  if(spawnClock>=1800){spawnClock=0;spawnTraffic();}
  updateSignal(dt);
  updateEmergency(now,dt);

  for(const dir of ["N","S","W","E"]){
    const lane=cars.filter(c=>c.entry===dir).sort((a,b)=>progress(b)-progress(a));
    for(const car of lane)if(cars.includes(car))updateCar(car,dt);
  }

  enforceLaneSpacing();
  updateSignals();
  updateMetrics();
  requestAnimationFrame(loop);
}

updateSignals();
updateMetrics();
requestAnimationFrame(loop);
})();