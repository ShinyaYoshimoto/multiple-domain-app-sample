/** 現在時刻のポート。ユースケースのテストで時刻を固定するために使う。 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
