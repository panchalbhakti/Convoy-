import { pointAlongRoute, offsetPoint } from '../geo.js';

/**
 * Testing mode: scripted fake vehicles that follow the real planned route and feed the SAME
 * ingest pipeline real GPS uses. Every simulated vehicle is flagged `simulated` and labelled in the UI.
 */
export const FLEET = [
  { key: 'A', vehicleName: 'Sim Car A', driverName: 'Asha (simulated)', vehicleType: 'car', startM: 6000, behaviour: 'steady' },
  { key: 'B', vehicleName: 'Sim SUV B', driverName: 'Bhavin (simulated)', vehicleType: 'suv', startM: 5000, behaviour: 'overtake' },
  { key: 'C', vehicleName: 'Sim Car C', driverName: 'Chirag (simulated)', vehicleType: 'car', startM: 3800, behaviour: 'slowdown' },
  { key: 'D', vehicleName: 'Sim Bike D', driverName: 'Dev (simulated)', vehicleType: 'bike', startM: 3000, behaviour: 'detour' },
  { key: 'E', vehicleName: 'Sim Car E', driverName: 'Esha (simulated)', vehicleType: 'car', startM: 2500, behaviour: 'stop' },
  { key: 'G', vehicleName: 'Sim Bus G', driverName: 'Gita (simulated)', vehicleType: 'bus', startM: 2000, behaviour: 'dropout' },
  { key: 'F', vehicleName: 'Sim Van F', driverName: 'Farid (simulated)', vehicleType: 'van', startM: 500, behaviour: 'straggler' },
];

const CRUISE = 22; // m/s, about 79 km/h

/** Speed in m/s at t seconds for a behaviour. */
export function speedAt(behaviour, t, { stopForS = 700 } = {}) {
  switch (behaviour) {
    case 'overtake': return t >= 10 && t < 110 ? 34 : CRUISE;
    case 'slowdown': return t >= 30 && t < 300 ? 4 : CRUISE;
    case 'stop': return t >= 30 && t < 30 + stopForS ? 0 : CRUISE;
    case 'straggler': return 22.5;
    default: return CRUISE;
  }
}

/** Sideways distance from the route in metres at t seconds (the bike takes a detour). */
export function lateralAt(behaviour, t) {
  if (behaviour !== 'detour') return 0;
  if (t < 45 || t > 160) return 0;
  const ramp = Math.min(1, (t - 45) / 10, (160 - t) / 10);
  return 600 * Math.max(0, ramp);
}

export const isSilent = (behaviour, t) => behaviour === 'dropout' && t >= 50 && t < 140;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulator {
  /** target = { ingest(id, loc, now), setConnected(id, bool) } */
  constructor({ target, route, vehicles, stopAlertMs = 600_000, intervalMs = 2000, now = () => Date.now() }) {
    this.target = target;
    this.route = route;
    this.intervalMs = intervalMs;
    this.nowFn = now;
    this.t = 0;
    this.rand = mulberry32(42);
    const f = Math.min(1, (route.totalM * 0.6) / 6000); // keep spacing sensible on short routes
    this.cars = vehicles.map(({ id, spec }) => ({
      id,
      spec,
      s: Math.min(route.totalM * 0.9, spec.startM * f),
      stopForS: stopAlertMs / 1000 + 40,
    }));
    this.timer = null;
  }

  start() {
    this.step();
    this.timer = setInterval(() => this.step(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  step() {
    const dt = this.intervalMs / 1000;
    this.t += dt;
    const now = this.nowFn();
    for (const car of this.cars) {
      const { behaviour } = car.spec;
      const v = car.s >= this.route.totalM ? 0 : speedAt(behaviour, this.t, { stopForS: car.stopForS });
      car.s = Math.min(this.route.totalM, car.s + v * dt);
      if (isSilent(behaviour, this.t)) {
        this.target.setConnected(car.id, false);
        continue;
      }
      this.target.setConnected(car.id, true);
      const p = pointAlongRoute(this.route, car.s);
      const lateral = lateralAt(behaviour, this.t);
      const q = offsetPoint(p.lat, p.lng, (p.bearing + 90) % 360, lateral + (this.rand() - 0.5) * 6);
      this.target.ingest(car.id, {
        lat: q.lat,
        lng: q.lng,
        accuracy: 6 + this.rand() * 8,
        speed: Math.max(0, v + (v > 0 ? (this.rand() - 0.5) * 1.5 : 0)),
        heading: p.bearing,
      }, now);
    }
  }
}
