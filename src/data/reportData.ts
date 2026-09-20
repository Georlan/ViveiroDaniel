import type { Pond } from '../types'

export const reportPonds: Pond[] = [
  {
    id: 'v01',
    name: 'V01',
    areaHa: 0.5,
    initialPopulation: 150000,
    laboratory: 'NOBRE',
    stockingDate: '2026-05-09',
    cycleStartDate: '2026-04-09',
    cycle: 2,
    feeder: 'Ermeson',
    plPerGram: 229,
    biometries: [
      { id: 'v01-36', date: '2026-06-13', currentWeightG: 3.5, feedRatePercent: 5, dailyFeedKg: 17, accumulatedFeedKg: 255 },
      { id: 'v01-43', date: '2026-06-20', currentWeightG: 3.6, feedRatePercent: 5, dailyFeedKg: 22, accumulatedFeedKg: 367 },
      { id: 'v01-54', date: '2026-07-01', currentWeightG: 4.9, feedRatePercent: 4.5, dailyFeedKg: 22, accumulatedFeedKg: 611 },
      { id: 'v01-62', date: '2026-07-09', currentWeightG: 5.5, feedRatePercent: 4, dailyFeedKg: 20, accumulatedFeedKg: 731 },
      { id: 'v01-68', date: '2026-07-15', currentWeightG: 7.1, feedRatePercent: 3.5, dailyFeedKg: 18, accumulatedFeedKg: 788 },
      { id: 'v01-75', date: '2026-07-22', currentWeightG: 9.1, feedRatePercent: 3.5, dailyFeedKg: 15, accumulatedFeedKg: 857 },
    ],
  },
  {
    id: 'v02',
    name: 'V02',
    areaHa: 0.5,
    initialPopulation: 80000,
    laboratory: 'LAVFORT',
    stockingDate: '2026-07-06',
    cycleStartDate: '2026-07-01',
    cycle: 2,
    feeder: 'Ermeson',
    plPerGram: 277,
    biometries: [],
  },
]
