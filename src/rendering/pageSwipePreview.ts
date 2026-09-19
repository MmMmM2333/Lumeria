/** Shared page display speed; diagnostic overrides last only for this session. */
export type PageSwipeSpeed = 0 | 4 | 6;
export const DEFAULT_PAGE_SWIPE_SPEED:PageSwipeSpeed=4;
let speed:PageSwipeSpeed=DEFAULT_PAGE_SWIPE_SPEED;
export function getPageSwipeSpeed():PageSwipeSpeed{return speed;}
export function setPageSwipeSpeed(value:PageSwipeSpeed):void{
  if(value!==0&&value!==4&&value!==6)throw new RangeError("Unsupported page swipe preview speed");
  speed=value;
}
export function cyclePageSwipeSpeed():PageSwipeSpeed{speed=speed===0?6:speed===6?4:0;return speed;}
