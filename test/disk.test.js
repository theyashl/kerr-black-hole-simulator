import { describe, it, expect } from 'vitest';
import { iscoRadius, diskTemperature, equatorialCrossingFrac, clampDiskOuter } from '../src/physics/disk.js';

describe('iscoRadius (prograde)', () => {
  it('is 6 at a=0 (Schwarzschild)', () => {
    expect(iscoRadius(0)).toBeCloseTo(6, 10);
  });
  it('is 1 at a=1 (extremal prograde)', () => {
    expect(iscoRadius(1)).toBeCloseTo(1, 6);
  });
  it('decreases monotonically with spin', () => {
    expect(iscoRadius(0)).toBeGreaterThan(iscoRadius(0.5));
    expect(iscoRadius(0.5)).toBeGreaterThan(iscoRadius(0.9));
    expect(iscoRadius(0.9)).toBeGreaterThan(iscoRadius(0.998));
  });
});

describe('diskTemperature', () => {
  it('is 1 at the inner edge', () => {
    expect(diskTemperature(6, 6)).toBeCloseTo(1, 10);
  });
  it('falls off outward as (rIn/r)^0.75', () => {
    expect(diskTemperature(12, 6)).toBeCloseTo(Math.pow(0.5, 0.75), 10);
    expect(diskTemperature(12, 6)).toBeLessThan(diskTemperature(6, 6));
  });
  it('is 0 inside the inner edge', () => {
    expect(diskTemperature(4, 6)).toBe(0);
  });
});

describe('equatorialCrossingFrac', () => {
  it('detects a crossing and interpolates the fraction', () => {
    const f = equatorialCrossingFrac(Math.PI / 2 - 0.1, Math.PI / 2 + 0.1);
    expect(f).toBeCloseTo(0.5, 6);
  });
  it('returns null when both states are on the same side', () => {
    expect(equatorialCrossingFrac(1.0, 1.2)).toBeNull();          // both below pi/2
    expect(equatorialCrossingFrac(2.0, 2.2)).toBeNull();          // both above pi/2
  });
  it('interpolates an off-center crossing', () => {
    // prev just below, next far above -> crossing near the start
    const f = equatorialCrossingFrac(Math.PI / 2 - 0.01, Math.PI / 2 + 0.09);
    expect(f).toBeCloseTo(0.1, 6);
  });
});

describe('clampDiskOuter', () => {
  it('leaves a valid outer radius unchanged', () => {
    expect(clampDiskOuter(6, 20)).toBe(20);
  });
  it('bumps the outer radius above the inner when inverted', () => {
    expect(clampDiskOuter(18, 6)).toBeCloseTo(18 * 1.1, 10);
    expect(clampDiskOuter(18, 6)).toBeGreaterThan(18);
  });
});
