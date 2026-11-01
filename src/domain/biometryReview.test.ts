import { describe, expect, it } from 'vitest'
import { compareMeasurements, feedScenario, assessFeedReference, validMeasurement } from './biometryReview'
import { suppliedFeedReference } from '../data/feedReference'
import { calculateHistory, technicalMetricsStatus, manualFeedRateForEdit, round } from './calculations'
import { demonstrationPonds } from '../data/demonstration'
import type { BiometryInput } from '../types'

const a: BiometryInput = { id:'a', date:'2026-06-20', currentWeightG:3.6, feedRatePercent:5, dailyFeedKg:22, accumulatedFeedKg:367 }
const b: BiometryInput = { id:'b', date:'2026-07-01', currentWeightG:4.9, feedRatePercent:4.5, dailyFeedKg:22, accumulatedFeedKg:611 }

describe('operator comparison from actual dates', () => {
  it('normalizes an eleven-day interval, instead of calling 1.3 g a weekly gain', () => {
    const result = compareMeasurements(a,b,[])
    expect(result?.days).toBe(11)
    expect(result?.weightChangeG).toBeCloseTo(1.3,10)
    expect(result?.dailyChangeG).toBeCloseTo(1.3/11,10)
    expect(result?.weeklyEquivalentG).toBeCloseTo(1.3/11*7,10)
    expect(result?.feedInPeriodKg).toBe(244)
    expect(result?.feedDailyChangeKg).toBe(0)
    expect(result?.feedBasis).toBe('accumulated-difference')
  })
  it('reproduces the final measured interval in the DJ report without inferring mortality', () => {
    const result = compareMeasurements({...a,date:'2026-07-15',currentWeightG:7.1,dailyFeedKg:18,accumulatedFeedKg:788}, {...b,date:'2026-07-22',currentWeightG:9.1,dailyFeedKg:15,accumulatedFeedKg:857}, [])
    expect(result?.days).toBe(7)
    expect(result?.weeklyEquivalentG).toBeCloseTo(2,10)
    expect(result?.feedInPeriodKg).toBe(69)
    expect(result?.feedDailyChangeKg).toBe(-3)
  })
  it('does not invent growth for the first measurement or divide by zero', () => {
    expect(compareMeasurements(null,b,[])).toBeNull()
    expect(compareMeasurements(a,{...b,date:a.date},[])).toBeNull()
    expect(compareMeasurements(b,a,[])).toBeNull()
  })
  it('rejects invalid calendar dates, missing weights and non-finite numbers', () => {
    expect(validMeasurement({...a,date:'2026-02-30'})).toBe(false)
    expect(validMeasurement({...a,currentWeightG:0})).toBe(false)
    expect(validMeasurement({...a,currentWeightG:NaN})).toBe(false)
    expect(compareMeasurements({...a,currentWeightG:-1},b,[])).toBeNull()
  })
  it('keeps negative changes visible and does not interpret them as negative growth of an individual', () => {
    expect(compareMeasurements(a,{...b,currentWeightG:3.2},[])?.weightChangeG).toBeCloseTo(-.4)
  })
  it('flags composition changes, including transfers on a measurement day, without double-counting events', () => {
    const event = {transferId:'t1',date:a.date,direction:'in' as const,animals:1000,averageWeightG:3,biomassKg:3,counterpartPondId:'v2',counterpartPondName:'V02'}
    const result=compareMeasurements(a,b,[event,event,{...event,transferId:'future',date:'2026-07-02'}])
    expect(result?.transfersInWindow).toBe(1)
    expect(result?.compositionChanged).toBe(true)
  })
  it('does not treat a falling accumulated-feed anchor as zero feed', () => {
    expect(compareMeasurements(a,{...b,accumulatedFeedKg:100},[])?.feedInPeriodKg).toBeNull()
    expect(compareMeasurements(a,{...b,accumulatedFeedKg:377},[])?.feedInconsistent).toBe(true)
  })
  it('identifies a period feed inconsistent with cumulative records', () => {
    const result=compareMeasurements(a,{...b,periodFeedKg:200},[])
    expect(result?.feedInPeriodKg).toBeNull()
    expect(result?.feedInconsistent).toBe(true)
  })
})

describe('feed-based simulation, not a population measurement', () => {
  it('exposes the spreadsheet 103% as an incompatible hypothesis without clamping it', () => {
    const result=feedScenario(220000,{...a,currentWeightG:3.15,feedRatePercent:4.5,dailyFeedKg:32})
    expect(result.status).toBe('inconsistent')
    expect(result.referenceFeedKg).toBeCloseTo(31.185,10)
    expect(result.impliedStockPercent).toBeCloseTo(32/31.185*100,10)
    expect(result.biomassKg).toBeCloseTo(32/.045,10)
  })
  it('does not infer zero animals from a zero feeding day or a missing rate', () => {
    expect(feedScenario(150000,{...a,dailyFeedKg:0}).status).toBe('insufficient')
    expect(feedScenario(150000,{...a,feedRatePercent:0}).biomassKg).toBeNull()
    expect(feedScenario(150000,{...a,feedRatePercent:Infinity}).status).toBe('insufficient')
  })
  it('keeps a plausible simulation conditional and supplies no FCA from the same feed input', () => {
    const result=feedScenario(150000,{...a,currentWeightG:9.1,feedRatePercent:3.5,dailyFeedKg:15})
    expect(result.status).toBe('conditional')
    expect(result.biomassKg).toBeCloseTo(428.57142857,8)
    expect(result.impliedStockPercent).toBeCloseTo(31.397174,5)
    expect('fca' in result).toBe(false)
  })
})

describe('supplied feeding table provenance and consistency', () => {
  it('preserves the photo including conflicting rows instead of making up a table', () => {
    expect(suppliedFeedReference.rows).toHaveLength(21)
    expect(suppliedFeedReference.rows.filter(row=>row.weightG===1)).toHaveLength(3)
    expect(assessFeedReference(1).status).toBe('ambiguous')
    expect(assessFeedReference(3).status).toBe('inconsistent')
    expect(assessFeedReference(18).status).toBe('inconsistent')
    expect(assessFeedReference(6).status).toBe('inconsistent')
  })
  it('shows only exact matches and does not extrapolate or recommend an unvalidated rate', () => {
    expect(assessFeedReference(4).rows[0]).toEqual({weightG:4,minPercent:3.9,maxPercent:4.8,idealPercent:4.6})
    expect(assessFeedReference(4).status).toBe('reference-only')
    expect(assessFeedReference(4.5).status).toBe('no-exact-match')
    expect(assessFeedReference(30).rows).toHaveLength(0)
  })
})


describe('authoritative history metrics', () => {
  it('has no invented initial growth and uses actual elapsed dates for later growth', () => {
    const history=calculateHistory(demonstrationPonds()[0])
    expect(history[0].growthG).toBeNull()
    expect(history[0].averageGrowthPerWeekG).toBeNull()
    expect(history[2].averageGrowthPerWeekG).toBeCloseTo(1.3/11*7,10)
    expect(history[3].averageGrowthPerWeekG).toBeCloseTo(.6/8*7,10)
    expect(history[4].averageGrowthPerWeekG).toBeCloseTo(1.6/6*7,10)
  })
  it('does not label feed divided by feed-inferred biomass as a validated FCA', () => {
    const pond=demonstrationPonds()[0]
    const history=calculateHistory(pond)
    expect(history[5].fca).toBeNull()
    expect(technicalMetricsStatus(pond,history[5]).fca).toBeNull()
  })
  it('preserves stored rates explicitly rather than reinterpreting them against an unknown table', () => {
    expect(manualFeedRateForEdit({...a,feedRatePercent:4.1,feedRateSource:'table'})).toBe('4.1')
    expect(manualFeedRateForEdit()).toBe('')
  })
})


it('rounds presentation values consistently at decimal half steps without binary subtraction artifacts',()=>{
  expect(round((5.5-4.9)/8*7,2)).toBe(.53)
  expect(round(-.525,2)).toBe(-.53)
  expect(round(1.005,2)).toBe(1.01)
})
