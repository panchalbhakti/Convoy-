import mongoose from 'mongoose';

export const VEHICLE_TYPES = ['car', 'suv', 'bike', 'van', 'bus'];

const vehicleSchema = new mongoose.Schema(
  {
    journeyRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true, index: true },
    vehicleName: { type: String, required: true, trim: true, maxlength: 40 },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    driverName: { type: String, required: true, trim: true, maxlength: 40 },
    color: { type: String, required: true },
    isLeader: { type: Boolean, default: false },
    removed: { type: Boolean, default: false },
    sharingStatus: { type: String, enum: ['off', 'sharing', 'denied'], default: 'off' },
    currentLocation: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      speed: Number,
      heading: Number,
    },
    lastUpdatedAt: Date,
    simulated: { type: Boolean, default: false }, // testing-mode vehicle, never real GPS
    sos: { active: Boolean, at: Date, lat: Number, lng: Number },
  },
  { timestamps: true }
);

export const Vehicle = mongoose.model('Vehicle', vehicleSchema);
