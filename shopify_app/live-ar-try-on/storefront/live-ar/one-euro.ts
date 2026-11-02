/** Speed-adaptive low-pass filter. Input timestamps are monotonic milliseconds. */
export class OneEuro {
  private raw?: number;
  private filtered=0;
  private derivative=0;
  private time=0;
  update(value:number,now:number,beta=.01):number {
    if(this.raw===undefined || now<=this.time || now-this.time>=350){
      this.raw=this.filtered=value;this.derivative=0;this.time=now;return value;
    }
    const dt=(now-this.time)/1000,alpha=(cutoff:number)=>1/(1+1/(2*Math.PI*cutoff*dt));
    this.derivative+=alpha(1)*((value-this.raw)/dt-this.derivative);
    this.filtered+=alpha(1.2+beta*Math.abs(this.derivative))*(value-this.filtered);
    this.raw=value;this.time=now;return this.filtered;
  }
}
