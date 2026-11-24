import mongoose from 'mongoose';

const locationPointSchema = new mongoose.Schema({
  vehicleRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
  journeyRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  speed: Number,
  accuracy: Number,
  timestamp: { type: Date, required: true },
});

// Location history is personal data: delete it automatically after 7 days.
locationPointSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const LocationPoint = mongoose.model('LocationPoint', locationPointSchema);
