import type { Pond } from '../types'

export const reportPonds: Pond[] = [
  {
    dataVersion: 2,
    id: 'v01',
    name: 'V01',
    areaHa: 0.5,
    initialPopulation: 220000,
    laboratory: 'ACQUAVALE',
    stockingDate: '2026-09-04',
    cycleStartDate: '2026-08-19',
    cycle: 5,
    feeder: 'Ermeson',
    plPerGram: 152,
    reportReferenceDate: null,
    plannedBiometries: [],
    productUsages: [
      { id: 'usage-20260906-n-control', date: '2026-09-06', product: 'N-CONTROL', quantity: 200, unit: 'g' },
      { id: 'usage-20260906-acucar', date: '2026-09-06', product: 'Açúcar', quantity: 2, unit: 'kg' },
      { id: 'usage-20260908-tcp', date: '2026-09-08', product: 'TCP', quantity: 2, unit: 'L' },
      { id: 'usage-20260911-n-aqua', date: '2026-09-11', product: 'N-AQUA', quantity: 200, unit: 'g' },
      { id: 'usage-20260916-tcp', date: '2026-09-16', product: 'TCP', quantity: 2, unit: 'L' },
    ],
    biometries: [],
  },
]
