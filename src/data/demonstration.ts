import type { Pond } from '../types'

/** Apenas demonstração em memória. As seis linhas são do PDF enviado, p. 2. */
export function demonstrationPonds():Pond[] {
  const source:Pond={
    dataVersion:2,id:'report-v01',name:'V01',areaHa:.5,initialPopulation:150000,
    laboratory:'NOBRE',stockingDate:'2026-05-09',cycleStartDate:'2026-04-09',cycle:2,
    feeder:'ERMESON',plPerGram:229,productUsages:[],populationMovements:[],
    biometries:[
      {id:'dj-36',date:'2026-06-13',currentWeightG:3.5,feedRatePercent:5,dailyFeedKg:17,accumulatedFeedKg:255},
      {id:'dj-43',date:'2026-06-20',currentWeightG:3.6,feedRatePercent:5,dailyFeedKg:22,accumulatedFeedKg:367},
      {id:'dj-54',date:'2026-07-01',currentWeightG:4.9,feedRatePercent:4.5,dailyFeedKg:22,accumulatedFeedKg:611},
      {id:'dj-62',date:'2026-07-09',currentWeightG:5.5,feedRatePercent:4,dailyFeedKg:20,accumulatedFeedKg:731},
      {id:'dj-68',date:'2026-07-15',currentWeightG:7.1,feedRatePercent:3.5,dailyFeedKg:18,accumulatedFeedKg:788},
      {id:'dj-75',date:'2026-07-22',currentWeightG:9.1,feedRatePercent:3.5,dailyFeedKg:15,accumulatedFeedKg:857},
    ],
  }
  return [source,{...source,id:'demo-02',name:'V02',stockingDate:'2026-09-04',cycleStartDate:'2026-08-19',areaHa:.4,initialPopulation:150000,biometries:[],laboratory:'',plPerGram:null,feeder:''}]
}
