export function hsvColor(h:number,s:number,v:number):number {
  const c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return rgb.reduce((color,channel)=>(color<<8)|Math.round((channel+m)*255),0);
}
export function colorHsv(color:number):[number,number,number]{
  const r=(color>>16&255)/255,g=(color>>8&255)/255,b=(color&255)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  const h=d===0?0:max===r?60*((g-b)/d%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);
  return [(h+360)%360,max===0?0:d/max,max];
}

