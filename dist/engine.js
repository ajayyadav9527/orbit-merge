export const W=5,H=6;
export function random(seed){let x=seed>>>0;return()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};}
export function newGame(seed=Date.now()){return {seed:seed>>>0,board:Array(W*H).fill(0),score:0,drops:0,merges:0,history:[],over:false};}
export function nextLevel(g,offset=0){const rng=random(g.seed);let n;for(let i=0;i<=g.drops+offset;i++)n=rng();return n<.6?1:n<.9?2:3;}
export function available(g,c){return Number.isInteger(c)&&c>=0&&c<W&&g.board[c]===0;}
export function drop(g,c){
 if(!available(g,c)||g.over)return false;
 g.history.push({board:[...g.board],score:g.score,drops:g.drops,merges:g.merges});if(g.history.length>20)g.history.shift();
 let r=H-1;while(g.board[r*W+c])r--;let at=r*W+c;g.board[at]=nextLevel(g);g.drops++;let chain=0;
 while(true){const level=g.board[at],seen=new Set([at]),stack=[at];while(stack.length){const p=stack.pop(),x=p%W,y=Math.floor(p/W);for(const q of [x>0?p-1:-1,x<W-1?p+1:-1,y>0?p-W:-1,y<H-1?p+W:-1])if(q>=0&&g.board[q]===level&&!seen.has(q)){seen.add(q);stack.push(q);}}
 if(seen.size<2)break;
 for(const p of seen)g.board[p]=0;g.board[at]=level+1;chain++;g.merges+=seen.size-1;g.score+=(2**(level+1))*(seen.size-1)*chain;
 // Gravity preserves each column's order and tracks the surviving planet.
 for(let x=0;x<W;x++){const items=[];for(let y=H-1;y>=0;y--){const p=y*W+x;if(g.board[p])items.push({value:g.board[p],anchor:p===at});}for(let y=0;y<H;y++)g.board[y*W+x]=0;items.forEach((v,i)=>{const p=(H-1-i)*W+x;g.board[p]=v.value;if(v.anchor)at=p;});}
 }
 g.over=g.board.slice(0,W).every(Boolean);return {chain};
}
export function undo(g){const h=g.history.pop();if(!h)return false;Object.assign(g,h,{over:false});return true;}
export function rescue(g){if(!g.over)return false;for(let c=0;c<W;c++)g.board[c]=0;g.history=[];g.over=false;return true;}
