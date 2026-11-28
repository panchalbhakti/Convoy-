// Smooths GPS jitter and rejects wild jumps, so the position on the map is steadier and closer to the truth.
// A 1-D Kalman filter weighted by the accuracy the phone reports for each fix: precise fixes pull the estimate
// strongly, vague ones barely move it. Speed widens the allowed movement so fast driving doesn't lag.

const MIN_Q = 3; // m/s of movement always allowed

export class GpsFilter {
  constructor() { this.reset(); }

  reset() {
    this.ts = null;
    this.lat = 0;
    this.lng = 0;
    this.variance = -1;
  }

  /** Returns { lat, lng, accuracy } or null when the fix is a bad outlier and should be ignored. */
  process({ lat, lng, accuracy, speed, ts }) {
    const acc = Math.max(Number.isFinite(accuracy) ? accuracy : 50, 1);

    if (this.variance < 0 || ts - this.ts > 30_000) {
      this.lat = lat; this.lng = lng; this.variance = acc * acc; this.ts = ts;
      return { lat, lng, accuracy: acc };
    }

    // A much vaguer fix than what we already know (typically a Wi-Fi/cell-tower guess) is ignored
    const known = Math.sqrt(this.variance);
    if (acc > 150 && acc > known * 3) return null;

    const dt = Math.max(0, (ts - this.ts) / 1000);
    const q = Math.max(MIN_Q, (Number.isFinite(speed) ? speed : 0) * 1.3 + MIN_Q);
    this.variance += dt * q * q;
    this.ts = ts;

    const k = this.variance / (this.variance + acc * acc);
    this.lat += k * (lat - this.lat);
    this.lng += k * (lng - this.lng);
    this.variance = (1 - k) * this.variance;
    return { lat: this.lat, lng: this.lng, accuracy: Math.max(Math.sqrt(this.variance), acc * 0.5) };
  }
}
