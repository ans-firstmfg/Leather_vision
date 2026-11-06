import {parseChart,recommendSize,type Measurements,type SizeChart,type SizeRow} from './sizing';

export const sizeLabels=['S','M','L','XL','XXL','3XL'] as const;
export type SizeLabel=typeof sizeLabels[number];
export interface GarmentDimensions {chest:number;shoulder:number;length:number;sleeve:number}
export interface SizeProfile extends SizeRow {label:SizeLabel;garment:GarmentDimensions}
export interface ProductSizeChart extends SizeChart {productId?:string;sizes:SizeProfile[]}
export interface SizeGrading {width:number;length:number;sleeve:number}
export const neutralGrading:SizeGrading={width:1,length:1,sleeve:1};

/** Illustrative fixtures only. Never fall back to these for a real product. */
export const demoSizeChart:ProductSizeChart={kind:'body_cm',sizes:sizeLabels.map((label,i)=>({
  label,chest:[84+8*i,92+8*i],waist:[72+8*i,80+8*i],hips:[88+8*i,96+8*i],
  garment:{chest:96+8*i,shoulder:44+2*i,length:64+2*i,sleeve:62+2*i},
}))};
export function productSizeChart(demo:boolean,productId:string,raw:string):ProductSizeChart|undefined {
  if(demo)return demoSizeChart;
  const chart=parseChart(raw) as ProductSizeChart|undefined;
  if(!chart||chart.productId!==productId)return;
  for(const row of chart.sizes){
    if(!sizeLabels.includes(row.label)||!row.garment)return;
    for(const key of ['chest','shoulder','length','sleeve'] as const){const n=row.garment[key];if(!Number.isFinite(n)||n<20||n>220)return;}
  }
  return chart;
}

export class SizeSelection {
  selected:SizeLabel;
  reference:SizeLabel;
  suggested?:SizeLabel;
  manual=false;
  constructor(readonly chart:ProductSizeChart|undefined,initial?:string){
    const first=chart?.sizes.find(s=>s.label===initial)?.label??chart?.sizes.find(s=>s.label==='M')?.label??chart?.sizes[0]?.label??'M';
    this.selected=this.reference=first;
  }
  choose(label:string){if(!sizeLabels.includes(label as SizeLabel))return;this.selected=label as SizeLabel;this.manual=true;}
  suggest(measurements:Measurements,canSelect:(label:SizeLabel)=>boolean=()=>true):SizeLabel|undefined {
    this.suggested=undefined;
    if(!this.chart)return;
    // All dimensions must fit one row. Shared boundaries favour the larger row.
    const result=recommendSize(this.chart,measurements,true);
    const label=this.chart.sizes.find(s=>s.label===result?.labels[0])?.label;
    if(!label)return;
    this.reference=this.suggested=label;
    if(!this.manual&&canSelect(label))this.selected=label;
    return label;
  }
  useSuggested(){if(!this.suggested)return;this.selected=this.suggested;this.manual=false;}
  grading():SizeGrading {
    const a=this.chart?.sizes.find(s=>s.label===this.selected)?.garment,b=this.chart?.sizes.find(s=>s.label===this.reference)?.garment;
    if(!a||!b)return neutralGrading;
    return {width:(a.chest/b.chest+a.shoulder/b.shoulder)/2,length:a.length/b.length,sleeve:a.sleeve/b.sleeve};
  }
}
