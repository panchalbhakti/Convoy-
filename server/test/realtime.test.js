// End-to-end realtime test: real Socket.IO server + runtime + engine + simulator.
// MongoDB is replaced by tiny in-memory fakes so this runs anywhere.
import test, { mock, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.JWT_SECRET = 'test-secret';
process.env.ALLOW_SIMULATION = 'true';

let nextId = 1;
const vehicles = [];
const journeys = [];
const match = (doc, q) => Object.entries(q).every(([k, v]) => String(doc[k]) === String(v));
const wrap = (d) => d;

const route = [];
for (let i = 0; i <= 200; i++) route.push([23.0 + i * 0.0009, 72.5]); // ~20 km north

mock.module('../src/models/Journey.js', {
  namedExports: {
    Journey: {
      findOne: async (q) => journeys.find((j) => match(j, q)) || null,
      updateOne: async () => ({}),
    },
  },
});
mock.module('../src/models/LocationPoint.js', { namedExports: { LocationPoint: { create: async () => ({}) } } });
mock.module('../src/models/Vehicle.js', {
  namedExports: {
    VEHICLE_TYPES: ['car', 'suv', 'bike', 'van', 'bus'],
    Vehicle: {
      findById: async (id) => vehicles.find((v) => String(v._id) === String(id)) || null,
      find: async (q) => vehicles.filter((v) => match(v, q.journeyRef ? { journeyRef: q.journeyRef, ...(q.simulated ? { simulated: true } : {}) } : q) && (q.removed === undefined || v.removed === q.removed)),
      updateOne: async () => ({}),
      updateMany: async () => ({}),
      countDocuments: async () => vehicles.filter((v) => !v.removed).length,
      insertMany: async (docs) => docs.map((d) => { const v = { _id: `v${nextId++}`, removed: false, isLeader: false, ...d }; vehicles.push(v); return v; }),
      deleteMany: async (q) => { for (let i = vehicles.length - 1; i >= 0; i--) if (vehicles[i].simulated && String(vehicles[i].journeyRef) === String(q.journeyRef)) vehicles.splice(i, 1); },
    },
  },
});

const { initSocket } = await import('../src/realtime/socket.js');
const { signMemberToken } = await import('../src/middleware/auth.js');
const { io: connect } = await import('socket.io-client');

const journey = {
  _id: 'j1', journeyId: 'jtest', status: 'planned', startedAt: null, routeStatus: 'ok',
  maxSeparationKm: 5, stopAlertMinutes: 1,
  start: { label: 'A', lat: route[0][0], lng: route[0][1] }, destination: { label: 'B', lat: route.at(-1)[0], lng: route.at(-1)[1] },
  route: { coordinates: route, distanceMeters: 20000, durationSeconds: 1500 },
};
journeys.push(journey);
const mk = (name, isLeader) => { const v = { _id: `v${nextId++}`, journeyRef: 'j1', vehicleName: name, driverName: name, vehicleType: 'car', color: '#123', isLeader, removed: false }; vehicles.push(v); return v; };
const leader = mk('Leader Car', true);
const guest = mk('Guest Car', false);

const server = http.createServer();
const io = initSocket(server);
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}`;
const open = (v, jid = 'jtest', token = signMemberToken(v, journey)) =>
  connect(url, { auth: { token, journeyId: jid }, transports: ['websocket'], reconnection: false, forceNew: true });
const once = (s, ev, ms = 8000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms); s.once(ev, (x) => { clearTimeout(t); res(x); }); });
const until = (s, pred, ms = 12000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off('state', h); rej(new Error('timeout waiting for state')); }, ms);
  const h = (st) => { if (pred(st)) { clearTimeout(t); s.off('state', h); res(st); } };
  s.on('state', h);
});

after(() => { io.close(); server.close(); });

test('rejects missing / wrong-journey / bad tokens', async () => {
  const bad = open(leader, 'jtest', 'garbage');
  await assert.rejects(once(bad, 'init', 2000));
  bad.close();
  const wrong = open(leader, 'other-journey');
  await assert.rejects(once(wrong, 'init', 2000));
  wrong.close();
});

test('members get init with route + state; locations flow between members live', async () => {
  const a = open(leader); const b = open(guest);
  const initA = await once(a, 'init'); await once(b, 'init');
  assert.ok(initA.route.coords.length > 100);
  assert.equal(initA.state.vehicles.length, 2);

  // Guest shares a location; leader sees it without refreshing
  const p = (lat) => ({ lat, lng: 72.5, accuracy: 10, speed: 20 });
  b.emit('location:update', p(23.05));
  const st = await until(a, (s) => s.vehicles.find((v) => v.vehicleName === 'Guest Car')?.live);
  assert.equal(st.vehicles.find((v) => v.vehicleName === 'Guest Car').status, 'moving');

  // Leader joins the order ahead of the guest
  a.emit('location:update', p(23.12));
  const ord = await until(a, (s) => s.order.ranked.length === 2);
  assert.equal(ord.order.ranked[0], String(leader._id));
  assert.ok(ord.order.separationM > 6000);

  // Guest stops sharing -> shown as unavailable, not live
  b.emit('sharing:stop');
  const off = await until(a, (s) => s.vehicles.find((v) => v.vehicleName === 'Guest Car').sharing === 'off');
  assert.equal(off.vehicles.find((v) => v.vehicleName === 'Guest Car').live, false);
  assert.equal(off.vehicles.find((v) => v.vehicleName === 'Guest Car').status, 'unavailable');

  // Denied permission is reported
  b.emit('sharing:denied');
  const den = await until(a, (s) => s.vehicles.find((v) => v.vehicleName === 'Guest Car').sharing === 'denied');
  assert.match(den.vehicles.find((v) => v.vehicleName === 'Guest Car').statusReason, /denied/);

  // Guest disconnects -> others see it as disconnected
  b.close();
  const gone = await until(a, (s) => s.vehicles.find((v) => v.vehicleName === 'Guest Car').status === 'disconnected');
  assert.ok(gone);
  a.close();
});

test('SOS reaches the whole group with the latest location', async () => {
  const a = open(leader); const b = open(guest);
  await once(a, 'init'); await once(b, 'init');
  b.emit('location:update', { lat: 23.03, lng: 72.5, accuracy: 8, speed: 15 });
  await until(a, (s) => s.vehicles.find((v) => v.vehicleName === 'Guest Car')?.live);
  const alertP = once(a, 'alert');
  b.emit('sos:start');
  const alert = await alertP;
  assert.equal(alert.type, 'sos');
  assert.equal(alert.severity, 'critical');
  assert.ok(Math.abs(alert.location.lat - 23.03) < 1e-9);
  const st = await until(a, (s) => s.vehicles.find((v) => v.vehicleName === 'Guest Car').flags.sos);
  assert.ok(st);
  b.emit('sos:cancel');
  await until(a, (s) => !s.vehicles.find((v) => v.vehicleName === 'Guest Car').flags.sos);
  a.close(); b.close();
});

test('only the leader can start testing mode; simulation produces 5+ live vehicles in order', async () => {
  const a = open(leader); const b = open(guest);
  await once(a, 'init'); await once(b, 'init');
  const denied = await new Promise((r) => b.emit('sim:start', {}, r));
  assert.equal(denied.ok, false);
  const ok = await new Promise((r) => a.emit('sim:start', {}, r));
  assert.equal(ok.ok, true, ok.error);
  const st = await until(a, (s) => s.order.ranked.length >= 5 && s.simulation.running, 15000);
  assert.ok(st.vehicles.filter((v) => v.simulated).length === 7);
  assert.ok(st.vehicles.filter((v) => v.simulated).every((v) => v.driverName.includes('simulated')));
  const stopped = await new Promise((r) => a.emit('sim:stop', {}, r));
  assert.equal(stopped.ok, true);
  const after = await until(a, (s) => !s.simulation.running && s.vehicles.every((v) => !v.simulated));
  assert.ok(after);
  a.close(); b.close();
});
