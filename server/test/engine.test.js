import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoute, snapToRoute, pointAlongRoute, haversine, offsetPoint } from '../src/geo.js';
import { JourneyEngine } from '../src/engine.js';
import { Simulator, FLEET } from '../src/realtime/simulator.js';

// ~10 km straight route heading north
const straight = () => {
  const c = [];
  for (let i = 0; i <= 100; i++) c.push([23.0 + i * 0.0009, 72.5]);
  return buildRoute(c, 600);
};
// U-shaped route: north, then west, then SOUTH. The finish has a LOWER latitude than the middle.
const uShape = () => {
  const c = [];
  for (let i = 0; i <= 50; i++) c.push([23.0 + i * 0.0009, 72.5]);
  for (let i = 1; i <= 50; i++) c.push([23.045, 72.5 - i * 0.0009]);
  for (let i = 1; i <= 50; i++) c.push([23.045 - i * 0.0009, 72.455]);
  return buildRoute(c, 900);
};
const at = (route, s, lateral = 0) => {
  const p = pointAlongRoute(route, s);
  const q = lateral ? offsetPoint(p.lat, p.lng, (p.bearing + 90) % 360, lateral) : p;
  return { lat: q.lat, lng: q.lng, accuracy: 10, speed: 20 };
};
const mkEngine = (route, opts = {}) => {
  const e = new JourneyEngine({ route, ...opts });
  ['A', 'B', 'C', 'D'].forEach((id, i) => e.upsertVehicle({ id, vehicleName: `Car ${id}`, driverName: id, vehicleType: 'car', color: '#000' }));
  ['A', 'B', 'C', 'D'].forEach((id) => e.setConnected(id, true));
  return e;
};

test('snapToRoute returns progress along the route and distance from it', () => {
  const r = straight();
  const p = at(r, 4000, 50);
  const s = snapToRoute(r, p.lat, p.lng);
  assert.ok(Math.abs(s.progressM - 4000) < 30);
  assert.ok(Math.abs(s.distM - 50) < 5);
});

test('order uses route progress, not latitude (U-shaped route)', () => {
  const r = uShape();
  const e = mkEngine(r);
  // A is further along the road but has LOWER latitude than B.
  e.ingest('A', at(r, r.totalM - 1000), 1000);
  e.ingest('B', at(r, 5000), 1000);
  const { snapshot } = e.evaluate(1000);
  assert.deepEqual(snapshot.order.ranked, ['A', 'B']);
  const a = snapshot.vehicles.find((v) => v.id === 'A');
  const b = snapshot.vehicles.find((v) => v.id === 'B');
  assert.ok(a.location.lat < b.location.lat, 'precondition: A has the lower latitude');
  assert.ok(Math.abs(b.gapAheadM - (r.totalM - 6000)) < 100);
});

test('order, gaps, straight vs route distance, and spread', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', at(r, 8000), 0);
  e.ingest('B', at(r, 5600), 0);
  e.ingest('C', at(r, 2500), 0);
  const { snapshot: s } = e.evaluate(0);
  assert.deepEqual(s.order.ranked, ['A', 'B', 'C']);
  const b = s.vehicles.find((v) => v.id === 'B');
  assert.ok(Math.abs(b.gapAheadM - 2400) < 60);
  assert.ok(Math.abs(b.straightAheadM - 2400) < 60);
  assert.ok(Math.abs(s.order.separationM - 5500) < 80);
  assert.equal(s.info.vehicleCount, 4);
});

test('order has hysteresis: tiny GPS wobble does not swap vehicles', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', at(r, 5000), 0);
  e.ingest('B', at(r, 4980), 0);
  assert.deepEqual(e.evaluate(0).snapshot.order.ranked, ['A', 'B']);
  e.ingest('B', at(r, 5010), 2000); // passes A by only 10 m
  e.ingest('A', at(r, 5000), 2000);
  assert.deepEqual(e.evaluate(2000).snapshot.order.ranked, ['A', 'B']);
  e.ingest('B', at(r, 5200), 4000); // clearly passes
  e.ingest('A', at(r, 5020), 4000);
  assert.deepEqual(e.evaluate(4000).snapshot.order.ranked, ['B', 'A']);
});

test('no route -> order reported unavailable instead of guessed', () => {
  const e = mkEngine(null);
  e.ingest('A', { lat: 23.1, lng: 72.5, accuracy: 10, speed: 10 }, 0);
  const { snapshot } = e.evaluate(0);
  assert.equal(snapshot.order.ok, false);
  assert.equal(snapshot.order.reason, 'no_route');
});

test('separation alert only after sustained breach, once, and clears with hysteresis', () => {
  const r = straight();
  const e = mkEngine(r, { maxSeparationM: 3000 });
  const feed = (t, a, c) => { e.ingest('A', at(r, a), t); e.ingest('C', at(r, c), t); return e.evaluate(t); };
  assert.equal(feed(0, 8000, 4000).alerts.length, 0);          // breach starts
  assert.equal(feed(10_000, 8000, 4000).alerts.length, 0);      // not sustained yet
  const hit = feed(21_000, 8000, 4000).alerts;
  assert.equal(hit.length, 1);
  assert.equal(hit[0].type, 'separation');
  assert.match(hit[0].message, /Car C is currently 4\.0 km behind the leading vehicle\./);
  assert.equal(feed(25_000, 8000, 4000).alerts.length, 0);      // no repeat
  const back = feed(30_000, 8000, 6000).alerts;                  // 2 km: below 85% of 3 km
  assert.equal(back[0].type, 'info');
});

test('brief separation spike does not alert', () => {
  const r = straight();
  const e = mkEngine(r, { maxSeparationM: 3000 });
  e.ingest('A', at(r, 8000), 0); e.ingest('C', at(r, 4000), 0); e.evaluate(0);
  e.ingest('A', at(r, 8000), 5000); e.ingest('C', at(r, 6000), 5000);
  assert.equal(e.evaluate(5000).alerts.length, 0);
  e.ingest('A', at(r, 8000), 30_000); e.ingest('C', at(r, 6000), 30_000);
  assert.equal(e.evaluate(30_000).alerts.length, 0);
});

test('deviation: GPS jitter is ignored, sustained departure alerts, vehicle leaves order', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', at(r, 6000), 0); e.ingest('B', at(r, 5000, 60), 0);
  assert.equal(e.evaluate(0).alerts.length, 0); // 60 m off is within threshold
  e.ingest('B', at(r, 5100, 500), 1000);
  e.ingest('A', at(r, 6100), 1000);
  let out = e.evaluate(1000);
  assert.equal(out.alerts.length, 0);
  assert.deepEqual(out.snapshot.order.ranked, ['A']); // off-route vehicle is not confidently ranked
  assert.equal(out.snapshot.vehicles.find((v) => v.id === 'B').offRoute, true);
  e.ingest('B', at(r, 5200, 500), 17_000); e.ingest('A', at(r, 6200), 17_000);
  out = e.evaluate(17_000);
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].type, 'deviation');
  assert.match(out.alerts[0].message, /Car B appears to have moved away from the planned route\./);
  assert.ok(out.alerts[0].location.lat);
});

test('poor GPS accuracy is not used for order or deviation', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', { ...at(r, 6000), accuracy: 900 }, 0);
  const { snapshot, alerts } = e.evaluate(0);
  assert.equal(snapshot.order.ok, false);
  assert.equal(alerts.length, 0);
});

test('stale position is never shown as live; status follows connection', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', at(r, 6000), 0);
  assert.equal(e.evaluate(5000).snapshot.vehicles[0].status, 'moving');
  let v = e.evaluate(40_000).snapshot.vehicles.find((x) => x.id === 'A');
  assert.equal(v.live, false);
  assert.equal(v.status, 'unavailable');
  assert.ok(v.location, 'last known position is kept');
  e.setConnected('A', false);
  v = e.evaluate(41_000).snapshot.vehicles.find((x) => x.id === 'A');
  assert.equal(v.status, 'disconnected');
  assert.deepEqual(e.evaluate(41_000).snapshot.order.ranked, []);
});

test('permission denied and sharing off are reported', () => {
  const e = mkEngine(straight());
  e.setSharing('A', 'denied');
  assert.match(e.evaluate(0).snapshot.vehicles[0].statusReason, /denied/);
  e.setSharing('B', 'off');
  assert.equal(e.evaluate(0).snapshot.vehicles[1].status, 'unavailable');
});

test('stopped alert after the configured time; GPS dropout resets the timer', () => {
  const r = straight();
  const e = mkEngine(r, { stopAlertMs: 60_000 });
  const still = { ...at(r, 4000), speed: 0 };
  for (let t = 0; t <= 20_000; t += 2000) { e.ingest('B', still, t); e.evaluate(t); }
  assert.equal(e.evaluate(20_000).snapshot.vehicles.find((v) => v.id === 'B').status, 'stopped');
  // 50 s of signal loss, then fixes resume
  for (let t = 80_000; t <= 100_000; t += 2000) {
    e.ingest('B', still, t);
    assert.equal(e.evaluate(t).alerts.length, 0, 'dropout must not be read as 10+ minutes stopped');
  }
  let fired = null;
  for (let t = 102_000; t <= 200_000 && !fired; t += 2000) {
    e.ingest('B', still, t);
    fired = e.evaluate(t).alerts.find((a) => a.type === 'stopped');
  }
  assert.ok(fired);
  assert.match(fired.message, /Car B has been stopped for 1 minute\./);
});

test('no stopped alert at the destination', () => {
  const r = straight();
  const e = mkEngine(r, { stopAlertMs: 10_000 });
  const arrived = { ...at(r, r.totalM - 50), speed: 0 };
  for (let t = 0; t <= 40_000; t += 2000) { e.ingest('A', arrived, t); assert.equal(e.evaluate(t).alerts.length, 0); }
});

test('speed is derived from movement when the device gives none; jitter is not movement', () => {
  const r = straight();
  const e = mkEngine(r);
  const p = at(r, 3000);
  for (let t = 0; t <= 10_000; t += 2000) {
    e.ingest('C', { lat: p.lat + (t % 4000 ? 0.00004 : 0), lng: p.lng, accuracy: 20 }, t);
  }
  assert.equal(e.evaluate(10_000).snapshot.vehicles.find((v) => v.id === 'C').status, 'stopped');
});

test('SOS carries latest location and is restorable', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', at(r, 3000), 0);
  const a = e.triggerSos('A', 5000);
  assert.equal(a.severity, 'critical');
  assert.ok(a.location.lat);
  const v = e.evaluate(5000).snapshot.vehicles.find((x) => x.id === 'A');
  assert.equal(v.flags.sos, true);
  assert.ok(e.clearSos('A', 6000));
});

test('journey info: remaining distance and ETA', () => {
  const r = straight();
  const e = mkEngine(r);
  e.startedAt = 0;
  e.ingest('A', at(r, 4000), 0);
  const { info } = e.evaluate(0).snapshot;
  assert.ok(Math.abs(info.remainingM - (r.totalM - 4000)) < 60);
  assert.ok(info.etaAt > 0);
});

test('simulator drives all scenarios through the real engine', () => {
  const r = uShape();
  const e = new JourneyEngine({ route: r, maxSeparationM: 5000, stopAlertMs: 60_000 });
  const vehicles = FLEET.map((spec) => { e.upsertVehicle({ id: spec.key, vehicleName: spec.vehicleName, driverName: spec.driverName, vehicleType: spec.vehicleType, color: '#000', simulated: true }); return { id: spec.key, spec }; });
  let clock = 0;
  const sim = new Simulator({ target: { ingest: (id, loc, now) => e.ingest(id, loc, now), setConnected: (id, c) => e.setConnected(id, c) }, route: r, vehicles, stopAlertMs: 60_000, now: () => clock });
  const seen = new Set();
  let sawDisconnected = false;
  for (let i = 0; i < 150; i++) { // 300 s
    clock += 2000; sim.step();
    const out = e.evaluate(clock);
    out.alerts.forEach((a) => seen.add(a.type));
    if (out.snapshot.vehicles.find((v) => v.id === 'G').status === 'disconnected') sawDisconnected = true;
  }
  assert.ok(seen.has('separation'), 'separation alert');
  assert.ok(seen.has('deviation'), 'deviation alert');
  assert.ok(seen.has('stopped'), 'stopped alert');
  assert.ok(sawDisconnected, 'dropout shows as disconnected');
});

test('a vehicle whose tab is in the background gets a longer, labelled window; foreground does not', () => {
  const r = straight();
  const e = mkEngine(r);
  e.ingest('A', at(r, 5000), 0);
  e.ingest('B', at(r, 4000), 0);
  e.setBackground('B', true);
  const mid = e.evaluate(60_000).snapshot.vehicles;
  assert.equal(mid.find((v) => v.id === 'A').live, false, 'foreground vehicle is stale after 30 s');
  const b = mid.find((v) => v.id === 'B');
  assert.equal(b.live, true, 'background vehicle still counts at 60 s');
  assert.equal(b.background, true);
  const late = e.evaluate(90_000).snapshot.vehicles.find((v) => v.id === 'B');
  assert.equal(late.live, false, 'but not live forever');
  assert.equal(late.background, false);
  e.setBackground('B', false);
  e.ingest('B', at(r, 4100), 100_000);
  assert.equal(e.evaluate(101_000).snapshot.vehicles.find((v) => v.id === 'B').background, false);
});
