import type { Pond } from '../types'

export const REPORT_REFERENCE_DATE = '2026-07-22'

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
    reportReferenceDate: REPORT_REFERENCE_DATE,
    plannedBiometries: [
      { cultivationDay: 82, date: '2026-07-29' },
      { cultivationDay: 89, date: '2026-08-05' },
      { cultivationDay: 96, date: '2026-08-12' },
      { cultivationDay: 103, date: '2026-08-19' },
      { cultivationDay: 110, date: '2026-08-26' },
      { cultivationDay: 117, date: '2026-09-02' },
      { cultivationDay: 124, date: '2026-09-09' },
      { cultivationDay: 131, date: '2026-09-16' },
      { cultivationDay: 138, date: '2026-09-23' },
      { cultivationDay: 145, date: '2026-09-30' },
      { cultivationDay: 152, date: '2026-10-07' },
    ],
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
