import { describe, it, expect } from 'vitest';
import { toggleSwapPair } from './circleLayout';

describe('toggleSwapPair', () => {
  it('adds a pair to an empty list', () => {
    expect(toggleSwapPair([], 7, 9)).toEqual([[7, 9]]);
  });

  it('removes the pair when the same two members are picked again', () => {
    expect(
      toggleSwapPair(
        [[7, 9]],
        7,
        9
      )
    ).toEqual([]);
  });

  it('removes regardless of pick order', () => {
    expect(toggleSwapPair([[7, 9]], 9, 7)).toEqual([]);
  });

  it('keeps other pairs when one is toggled off', () => {
    expect(
      toggleSwapPair(
        [
          [7, 9],
          [10, 11],
        ],
        7,
        9
      )
    ).toEqual([[10, 11]]);
  });

  it('adds a second pair alongside an existing one', () => {
    expect(toggleSwapPair([[7, 9]], 10, 11)).toEqual([
      [7, 9],
      [10, 11],
    ]);
  });

  it('moves a member to a new partner, dropping the old pair', () => {
    expect(
      toggleSwapPair(
        [
          [7, 9],
          [10, 11],
        ],
        7,
        10
      )
    ).toEqual([[7, 10]]);
  });

  it('drops conflicting pairs on both sides', () => {
    expect(
      toggleSwapPair(
        [
          [7, 9],
          [10, 11],
        ],
        9,
        11
      )
    ).toEqual([[9, 11]]);
  });
});
