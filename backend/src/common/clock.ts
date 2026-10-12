export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Settable/advanceable clock for tests. */
export class FakeClock implements Clock {
  constructor(private current: Date | string | number = new Date()) {
    this.current = new Date(current);
  }

  now(): Date {
    return new Date(this.current as Date);
  }

  set(value: Date | string | number): void {
    this.current = new Date(value);
  }

  advance(ms: number): void {
    this.current = new Date((this.current as Date).getTime() + ms);
  }

  advanceHours(hours: number): void {
    this.advance(hours * 3_600_000);
  }
}
