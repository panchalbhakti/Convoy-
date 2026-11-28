import { haversine, snapToRoute } from './geo.js';

export const DEFAULTS = {
  staleMs: 30_000, // a position older than this is NOT live
  backgroundStaleMs: 75_000, // phones throttle GPS for a tab in the background, so allow a longer (still clearly labelled) window
  accuracyOrderMaxM: 200, // worse GPS accuracy than this is not trusted for ordering / deviation
  devMinM: 150, // minimum off-route distance that counts as a deviation (scaled up by GPS accuracy)
  devSustainMs: 15_000, // must stay off route this long before alerting
  devClearFactor: 0.6,
  sepSustainMs: 20_000, // must stay beyond the max separation this long before alerting
  sepClearFactor: 0.85,
  movingMps: 2.0, // >= 7.2 km/h counts as moving
  stoppedMps: 1.0, // < 3.6 km/h counts as stopped
  arrivalM: 300, // no "stopped" alerts this close to the destination
  endZoneM: 300, // no deviation alerts in the first/last 300 m of the route
  orderHysteresisM: 30, // a vehicle must pass another by this much before the order changes
};

const fmtKm = (m) => (m >= 100_000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km`);
const fmtMins = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m === 1 ? '1 minute' : `${m} minutes`;
};
const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function newRec(meta) {
  return {
    meta,
    connected: false,
    background: false, // the person switched to another tab/app (reported by their browser)
    sharing: 'off', // off | sharing | denied
    loc: null,
    lastAt: null,
    speedMps: null,
    motion: 'unknown', // unknown | moving | stopped
    stoppedSince: null,
    stoppedAlerted: false,
    snap: null,
    offRouteSince: null,
    offRouteAlerted: false,
    sepSince: null,
    sepAlerted: false,
    sos: null,
  };
}

/**
 * Pure, clock-injected group-travel logic: freshness, vehicle status, route progress,
 * vehicle order, separation, deviation, stopped detection and ETA.
 * Nothing here touches the network or the database, so it is fully unit-testable.
 */
export class JourneyEngine {
  constructor({ route = null, maxSeparationM = 5000, stopAlertMs = 600_000, startedAt = null, config = {} } = {}) {
    this.cfg = { ...DEFAULTS, ...config };
    this.route = route;
    this.maxSepM = maxSeparationM;
    this.stopAlertMs = stopAlertMs;
    this.startedAt = startedAt;
    this.vehicles = new Map();
    this.prevRank = new Map();
    this.emaSpeed = null;
    this.seq = 0;
  }

  setRoute(route) {
    this.route = route;
    this.prevRank.clear();
    for (const rec of this.vehicles.values()) {
      rec.snap = route && rec.loc ? snapToRoute(route, rec.loc.lat, rec.loc.lng) : null;
      rec.offRouteSince = null;
      rec.offRouteAlerted = false;
      rec.sepSince = null;
      rec.sepAlerted = false;
    }
  }

  setSettings({ maxSeparationM, stopAlertMs }) {
    if (maxSeparationM != null) this.maxSepM = maxSeparationM;
    if (stopAlertMs != null) this.stopAlertMs = stopAlertMs;
  }

  upsertVehicle(meta) {
    const rec = this.vehicles.get(meta.id);
    if (rec) rec.meta = { ...rec.meta, ...meta };
    else this.vehicles.set(meta.id, newRec(meta));
  }

  removeVehicle(id) {
    this.vehicles.delete(id);
    this.prevRank.delete(id);
  }

  setConnected(id, connected) {
    const rec = this.vehicles.get(id);
    if (!rec) return;
    rec.connected = connected;
    if (!connected) rec.background = false;
  }

  /** The browser tells us when the page is hidden (another tab or app in front). */
  setBackground(id, hidden) {
    const rec = this.vehicles.get(id);
    if (rec) rec.background = !!hidden;
  }

  _staleMs(rec) {
    return rec.background ? this.cfg.backgroundStaleMs : this.cfg.staleMs;
  }

  setSharing(id, state) {
    const rec = this.vehicles.get(id);
    if (!rec) return;
    rec.sharing = state;
    if (state !== 'sharing') {
      rec.motion = 'unknown';
      rec.stoppedSince = null;
      rec.stoppedAlerted = false;
      rec.speedMps = null;
    }
  }

  /** Record a GPS fix. `now` is server receive time (device clocks are not trusted). */
  ingest(id, loc, now) {
    const rec = this.vehicles.get(id);
    if (!rec || !validCoord(loc.lat, loc.lng)) return null;
    const prev = rec.loc;
    const gap = rec.lastAt == null ? Infinity : now - rec.lastAt;

    let speed = null;
    if (Number.isFinite(loc.speed) && loc.speed >= 0) {
      speed = loc.speed;
    } else if (prev && gap >= 1500 && gap <= this._staleMs(rec)) {
      const d = haversine(prev.lat, prev.lng, loc.lat, loc.lng);
      const noise = Math.max(15, loc.accuracy || 0); // movement smaller than GPS noise is not movement
      speed = d < noise ? 0 : d / (gap / 1000);
    }
    if (speed != null) {
      rec.speedMps = rec.speedMps == null || gap > this._staleMs(rec) ? speed : 0.5 * rec.speedMps + 0.5 * speed;
    }
    if (gap > this._staleMs(rec)) {
      // Signal came back after a gap: restart stop detection so a GPS dropout is never read as "stopped".
      rec.motion = 'unknown';
      rec.stoppedSince = null;
      rec.stoppedAlerted = false;
    }
    if (rec.speedMps != null) {
      if (rec.speedMps >= this.cfg.movingMps) {
        rec.motion = 'moving';
        rec.stoppedSince = null;
        rec.stoppedAlerted = false;
      } else if (rec.speedMps < this.cfg.stoppedMps && rec.motion !== 'stopped') {
        rec.motion = 'stopped';
        rec.stoppedSince = now;
      }
    }

    rec.loc = {
      lat: loc.lat,
      lng: loc.lng,
      accuracy: Number.isFinite(loc.accuracy) ? loc.accuracy : null,
      speed: Number.isFinite(loc.speed) ? loc.speed : null,
      heading: Number.isFinite(loc.heading) ? loc.heading : null,
    };
    rec.lastAt = now;
    rec.sharing = 'sharing';
    if (this.route) rec.snap = snapToRoute(this.route, loc.lat, loc.lng, rec.snap ? rec.snap.progressM : null);
    return rec;
  }

  restoreSos(id, sos) {
    const rec = this.vehicles.get(id);
    if (rec) rec.sos = sos;
  }

  triggerSos(id, now) {
    const rec = this.vehicles.get(id);
    if (!rec) return null;
    rec.sos = { at: now, lat: rec.loc?.lat ?? null, lng: rec.loc?.lng ?? null, locAt: rec.lastAt };
    return this._alert('sos', 'critical', rec, `SOS from ${rec.meta.driverName}`, `${rec.meta.vehicleName} sent an SOS to the group.`, now, {
      location: rec.sos.lat == null ? null : { lat: rec.sos.lat, lng: rec.sos.lng, at: rec.lastAt },
    });
  }

  clearSos(id, now) {
    const rec = this.vehicles.get(id);
    if (!rec || !rec.sos) return null;
    rec.sos = null;
    return this._alert('info', 'info', rec, 'SOS cancelled', `${rec.meta.vehicleName} cancelled the SOS.`, now);
  }

  _alert(type, severity, rec, title, message, now, extra = {}) {
    return {
      id: `a${++this.seq}`,
      type,
      severity,
      vehicleId: rec.meta.id,
      vehicleName: rec.meta.vehicleName,
      title,
      message,
      at: now,
      ...extra,
    };
  }

  evaluate(now) {
    const cfg = this.cfg;
    const route = this.route;
    const alerts = [];
    const items = [];

    for (const rec of this.vehicles.values()) {
      const age = rec.lastAt == null ? null : now - rec.lastAt;
      const hasLoc = !!rec.loc;
      const live = hasLoc && rec.sharing === 'sharing' && age <= this._staleMs(rec);

      let status;
      let reason = null;
      if (live) {
        status = rec.motion === 'stopped' ? 'stopped' : 'moving';
      } else {
        status = rec.connected ? 'unavailable' : 'disconnected';
        if (rec.sharing === 'denied') reason = 'Location permission was denied';
        else if (!hasLoc) reason = rec.connected ? 'Has not shared a location yet' : 'Not connected';
        else if (rec.sharing === 'off') reason = rec.connected ? 'Stopped sharing location' : 'Not connected';
        else reason = rec.connected ? 'No recent GPS update' : 'Lost connection';
        // Never carry stop/deviation timers across a gap in live data.
        rec.motion = 'unknown';
        rec.stoppedSince = null;
        rec.stoppedAlerted = false;
        rec.offRouteSince = null;
        rec.sepSince = null;
      }

      const snap = live && route ? rec.snap : null;
      let offRouteNow = false;
      let lowAccuracy = false;
      if (snap) {
        const acc = rec.loc.accuracy ?? 20;
        lowAccuracy = acc > cfg.accuracyOrderMaxM;
        const thr = Math.max(cfg.devMinM, 2 * acc);
        if (!lowAccuracy) {
          if (snap.distM > thr) {
            offRouteNow = true;
            if (rec.offRouteSince == null) rec.offRouteSince = now;
            const inZone = snap.progressM >= cfg.endZoneM && snap.progressM <= route.totalM - cfg.endZoneM;
            if (!rec.offRouteAlerted && inZone && now - rec.offRouteSince >= cfg.devSustainMs) {
              rec.offRouteAlerted = true;
              alerts.push(this._alert('deviation', 'warning', rec, 'Route Deviation Detected!',
                `${rec.meta.vehicleName} appears to have moved away from the planned route.`, now,
                { distFromRouteM: Math.round(snap.distM), location: { lat: rec.loc.lat, lng: rec.loc.lng, at: rec.lastAt } }));
            }
          } else {
            rec.offRouteSince = null;
            if (snap.distM < thr * cfg.devClearFactor && rec.offRouteAlerted) {
              rec.offRouteAlerted = false;
              alerts.push(this._alert('info', 'info', rec, 'Back on route', `${rec.meta.vehicleName} is back on the planned route.`, now));
            }
          }
        }
      }

      let stoppedForMs = null;
      if (live && rec.motion === 'stopped' && rec.stoppedSince != null) {
        stoppedForMs = now - rec.stoppedSince;
        const arrived = snap && route.totalM - snap.progressM < cfg.arrivalM;
        if (!rec.stoppedAlerted && !arrived && stoppedForMs >= this.stopAlertMs) {
          rec.stoppedAlerted = true;
          alerts.push(this._alert('stopped', 'warning', rec, 'Vehicle stopped',
            `${rec.meta.vehicleName} has been stopped for ${fmtMins(stoppedForMs)}.`, now,
            { location: { lat: rec.loc.lat, lng: rec.loc.lng, at: rec.lastAt } }));
        }
      }

      items.push({ rec, age, live, status, reason, snap, offRouteNow, lowAccuracy, stoppedForMs });
    }

    // ---- Vehicle order: by progress ALONG THE ROUTE, never by raw lat/lng ----
    const rankable = items.filter((it) => it.live && it.snap && !it.lowAccuracy && !it.offRouteNow);
    const H = cfg.orderHysteresisM;
    const list = [...rankable].sort((a, b) => {
      const pa = this.prevRank.get(a.rec.meta.id);
      const pb = this.prevRank.get(b.rec.meta.id);
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return b.snap.progressM - a.snap.progressM;
    });
    for (let i = 1; i < list.length; i++) {
      for (let j = i; j > 0 && list[j].snap.progressM > list[j - 1].snap.progressM + H; j--) {
        [list[j - 1], list[j]] = [list[j], list[j - 1]];
      }
    }
    this.prevRank = new Map(list.map((it, i) => [it.rec.meta.id, i]));

    const byId = new Map();
    list.forEach((it, i) => {
      const lead = list[0].snap.progressM;
      const ahead = i > 0 ? list[i - 1] : null;
      byId.set(it.rec.meta.id, {
        rank: i + 1,
        gapAheadM: ahead ? Math.max(0, ahead.snap.progressM - it.snap.progressM) : null,
        gapToLeaderM: i > 0 ? Math.max(0, lead - it.snap.progressM) : null,
        straightAheadM: ahead ? haversine(ahead.rec.loc.lat, ahead.rec.loc.lng, it.rec.loc.lat, it.rec.loc.lng) : null,
      });
    });

    // ---- Group separation ----
    list.forEach((it, i) => {
      const rec = it.rec;
      if (i === 0) {
        rec.sepSince = null;
        rec.sepAlerted = false;
        return;
      }
      const gap = byId.get(rec.meta.id).gapToLeaderM;
      if (gap > this.maxSepM) {
        if (rec.sepSince == null) rec.sepSince = now;
        if (!rec.sepAlerted && now - rec.sepSince >= cfg.sepSustainMs) {
          rec.sepAlerted = true;
          alerts.push(this._alert('separation', 'warning', rec, 'Group Separation Alert!',
            `${rec.meta.vehicleName} is currently ${fmtKm(gap)} behind the leading vehicle.`, now, { gapM: Math.round(gap) }));
        }
      } else {
        rec.sepSince = null;
        if (rec.sepAlerted && gap < this.maxSepM * cfg.sepClearFactor) {
          rec.sepAlerted = false;
          alerts.push(this._alert('info', 'info', rec, 'Back with the group', `${rec.meta.vehicleName} is back within ${fmtKm(this.maxSepM)} of the leader.`, now));
        }
      }
    });

    let order;
    if (!route) {
      order = { ok: false, reason: 'no_route', message: 'Vehicle order is unavailable because no planned route is loaded.', ranked: [] };
    } else if (!list.length) {
      order = { ok: false, reason: 'no_data', message: 'Vehicle order will appear once vehicles share a reliable position on the route.', ranked: [] };
    } else {
      order = {
        ok: true,
        ranked: list.map((it) => it.rec.meta.id),
        leaderId: list[0].rec.meta.id,
        lastId: list[list.length - 1].rec.meta.id,
        separationM: list[0].snap.progressM - list[list.length - 1].snap.progressM,
        message: list.length < 2 ? 'Only one vehicle has a reliable position on the route so far.' : null,
      };
    }

    // ---- Journey information ----
    const total = route ? route.totalM : null;
    const lead = list[0] || null;
    const travelled = lead ? lead.snap.progressM : null;
    const remaining = total != null && travelled != null ? Math.max(0, total - travelled) : null;
    if (lead && lead.rec.speedMps != null && lead.rec.motion === 'moving') {
      this.emaSpeed = this.emaSpeed == null ? lead.rec.speedMps : 0.9 * this.emaSpeed + 0.1 * lead.rec.speedMps;
    }
    const base = route && route.durationS ? route.totalM / route.durationS : null;
    let spd = base;
    if (this.emaSpeed != null && this.emaSpeed >= 3) spd = base ? 0.5 * this.emaSpeed + 0.5 * base : this.emaSpeed;
    const arrived = remaining != null && remaining < cfg.arrivalM;
    const info = {
      totalM: total,
      travelledM: travelled,
      remainingM: remaining,
      arrived,
      etaAt: remaining != null && spd > 0 && !arrived ? Math.round(now + (remaining / spd) * 1000) : null,
      startedAt: this.startedAt,
      vehicleCount: items.length,
      liveCount: items.filter((it) => it.live).length,
    };

    const vehicles = items.map((it) => {
      const { rec } = it;
      const r = byId.get(rec.meta.id);
      return {
        ...rec.meta,
        status: it.status,
        statusReason: it.reason,
        live: it.live,
        background: it.live && rec.background,
        sharing: rec.sharing,
        connected: rec.connected,
        location: rec.loc,
        lastUpdatedAt: rec.lastAt,
        speedKmh: it.live && rec.speedMps != null ? Math.round(rec.speedMps * 3.6) : null,
        progressM: it.snap ? Math.round(it.snap.progressM) : null,
        distFromRouteM: it.snap ? Math.round(it.snap.distM) : null,
        offRoute: it.offRouteNow,
        lowAccuracy: it.lowAccuracy,
        rank: r ? r.rank : null,
        gapAheadM: r ? r.gapAheadM : null,
        gapToLeaderM: r ? r.gapToLeaderM : null,
        straightAheadM: r ? r.straightAheadM : null,
        stoppedForMs: it.stoppedForMs,
        flags: { separated: rec.sepAlerted, offRoute: rec.offRouteAlerted, stoppedLong: rec.stoppedAlerted, sos: !!rec.sos },
        sos: rec.sos,
      };
    });

    return {
      snapshot: { now, vehicles, order, info, settings: { maxSeparationM: this.maxSepM, stopAlertMs: this.stopAlertMs } },
      alerts,
    };
  }
}
