// Original scene geometry, drawn at low resolution for the character renderer.
export function createRoom() {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 500;
  const c = canvas.getContext('2d'); c.scale(2, 2);
  const box = (x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
  const shape = (points,color) => {c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
  const oval=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
  let seed=53; const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  box(0,0,400,250,'#201b20');box(8,8,384,157,'#604431');
  for(let y=8;y<166;y+=12){box(8,y,384,1,'#2e2425');box(8,y+2,384,1,'#8a5c37');}
  for(let x=10;x<400;x+=86){box(x,4,6,164,'#342626');box(x+6,4,2,164,'#986b3e');}
  box(0,0,400,8,'#302327');box(0,8,400,2,'#bf8b48');
  box(0,166,400,84,'#634530');
  for(let y=168;y<250;y+=12){box(0,y,400,1,'#332729');for(let x=(y%24)*4;x<400;x+=58)box(x,y,1,12,'#392a29');}
  // Book-lined alcoves, with alternating spine heights and brass shelf lights.
  const palette=['#ae6e41','#8d4838','#c5a064','#69796b','#786379','#aa8d57'];
  function shelf(x,w){box(x,12,w,132,'#251e23');for(let y=37;y<142;y+=27){for(let bx=x+3;bx<x+w-4;bx+=5){const h=13+rand()*9;box(bx,y-h,4,h,palette[Math.floor(rand()*palette.length)]);box(bx,y-h+3,4,1,'#d8b978');box(bx,y-3,4,1,'#3d2e29');}box(x-1,y,w+2,3,'#92673c');box(x,y+3,w,1,'#e4a550');}}
  shelf(9,64);shelf(350,43);
  // Small blue winter window, surrounded by plenty of timber wall.
  box(145,17,111,94,'#271f25');box(148,20,105,88,'#a47344');box(152,24,98,78,'#152537');
  for(let y=24;y<102;y+=4)box(152,y,98,4,`rgb(${24+y*.10},${37+y*.15},${59+y*.22})`);
  oval(230,36,6,6,'#a2b7bb');oval(233,34,6,6,'#1c2b40');
  shape([[152,90],[175,86],[204,94],[233,88],[250,92],[250,102],[152,102]],'#879caa');
  function pine(x,y,h){box(x-1,y,2,h,'#3b4a51');for(let i=0;i<4;i++){let tip=y+i*h*.18,half=h*(.16+i*.045);shape([[x,tip],[x-half,tip+h*.43],[x+half,tip+h*.43]],'#263f48');shape([[x,tip],[x-half,tip+h*.43],[x-half*.45,tip+h*.31],[x+half*.4,tip+h*.32]],'#a5b6b9');}}
  pine(166,39,54);pine(185,57,36);pine(244,51,42);
  box(217,81,15,13,'#594d44');shape([[214,82],[223,73],[235,82]],'#b3c0c3');box(220,84,3,4,'#e3b568');box(226,84,3,4,'#e3b568');
  box(199,24,5,79,'#90633d');box(152,60,98,4,'#a47743');box(144,104,113,5,'#c19357');box(145,110,112,3,'#35262a');
  // Framed botanical pictures.
  for(const [x,y] of [[111,35],[274,39]]){box(x,y,22,34,'#201e24');box(x+2,y+2,18,30,'#b38e55');box(x+4,y+4,14,26,'#65674f');box(x+10,y+9,1,17,'#c0a975');for(let k=0;k<4;k++){oval(x+8+(k%2)*5,y+10+k*4,3,2,'#bca373');}}
  // Persian rug beneath the furniture.
  shape([[50,184],[320,180],[389,244],[27,249]],'#403035');shape([[60,187],[313,184],[375,240],[39,245]],'#a46b4f');shape([[72,192],[306,189],[359,235],[52,239]],'#624649');
  for(let y=195;y<235;y+=10)for(let x=70;x<330;x+=18)shape([[x,y],[x+5,y+4],[x,y+8],[x-5,y+4]],'#c09260');
  // The deep sofa with three soft back cushions and chunky knitted blanket.
  oval(108,218,107,17,'#272127');box(14,153,185,54,'#714936');
  shape([[13,153],[17,128],[29,123],[152,125],[179,137],[196,163],[185,186],[22,189]],'#a57146');
  for(let i=0;i<3;i++){let x=25+i*49;shape([[x,134],[x+5,129],[x+43,131],[x+47,161],[x+39,166],[x-3,161]],'#ba8755');box(x+5,133,30,2,'#dca366');}
  shape([[19,178],[163,162],[194,174],[184,196],[22,210]],'#bb8751');shape([[22,201],[184,187],[188,209],[30,229]],'#825837');
  shape([[7,150],[18,145],[31,155],[35,211],[21,226],[4,216]],'#ba8150');shape([[177,155],[192,151],[201,158],[198,191],[184,199]],'#bf8d59');
  const cushion=(x,y,w,h,color)=>{shape([[x+3,y],[x+w-4,y-3],[x+w,y+4],[x+w-1,y+h],[x+3,y+h+2],[x-2,y+6]],color);};
  cushion(35,153,36,30,'#88543a');cushion(71,144,42,31,'#923f36');cushion(119,143,40,29,'#b18561');
  for(let y=146;y<169;y+=5)for(let x=122;x<155;x+=5)box(x+(y%2),y,2,2,'#653c36');
  shape([[18,179],[62,176],[99,198],[103,246],[58,250],[48,213]],'#8d483c');
  for(let y=184;y<249;y+=4)for(let x=54;x<99;x+=4){box(x+(y%3),y,2,1,'#bf7c57');box(x+1,y+1,1,2,'#5c3435');}
  // Floor lamp and pleated amber shade.
  box(86,103,2,25,'#b78347');oval(87,129,10,3,'#523e2d');shape([[77,80],[96,80],[108,105],[65,105]],'#e5ac5e');
  for(let x=72;x<104;x+=4)shape([[83+(x-83)*.45,82],[x,103],[x+1,103]],'#ffe0a0');box(65,105,43,2,'#8e5e32');
  // Black cast iron stove, arch, hearth and glowing logs.
  box(309,119,75,96,'#23232a');box(314,126,64,77,'#454039');box(317,128,58,70,'#1d2028');
  shape([[323,177],[323,148],[327,139],[339,135],[355,136],[367,144],[370,180]],'#754329');
  shape([[327,176],[327,149],[332,142],[343,139],[355,141],[366,149],[366,178]],'#3e2727');
  for(let i=0;i<9;i++){box(329+i*4,170+(i%2)*2,4,4,'#bb6334');box(330+i*4,171,2,1,'#efb859');}
  box(320,179,51,4,'#8d6b44');box(311,202,71,4,'#966f46');shape([[310,206],[384,207],[397,222],[302,222]],'#5f4c3b');box(302,222,95,5,'#30272a');
  box(305,116,82,4,'#af8751');box(304,120,85,2,'#292228');
  // Lantern and copper kettle on the mantel.
  box(330,98,15,18,'#493a2c');box(332,100,11,14,'#dca355');box(336,104,5,10,'#f1c987');shape([[328,98],[337,91],[347,98]],'#806039');box(336,88,3,4,'#b18a53');
  oval(374,111,10,5,'#9e6238');box(367,105,14,6,'#bd8549');box(369,102,10,3,'#5e4931');
  // Round table, open book, flowers, cups and candles.
  box(171,217,5,31,'#60402c');box(284,214,5,29,'#60402c');oval(224,211,83,22,'#50362b');oval(224,204,83,24,'#a27446');
  for(let y=190;y<224;y+=7){c.save();c.beginPath();c.ellipse(224,204,81,22,0,0,Math.PI*2);c.clip();box(140,y,170,1,'#785331');c.restore();}
  shape([[184,198],[206,195],[219,202],[238,197],[254,201],[244,224],[216,221],[175,216]],'#53382c');
  shape([[185,196],[206,194],[219,200],[237,195],[254,198],[244,219],[216,218],[177,213]],'#e5c88f');
  for(let y=199;y<214;y+=3){box(187,y,20,1,'#ad8c59');box(224,y+1,18,1,'#ad8c59');}shape([[219,200],[216,218],[219,217]],'#88633d');
  function cup(x,y){oval(x,y+8,13,3,'#d1a369');box(x-8,y-1,16,9,'#88603d');oval(x,y-1,8,3,'#ddbd88');oval(x,y-1,6,2,'#40302a');box(x+8,y+1,4,5,'#a87947');box(x+9,y+2,2,3,'#4d352c');}
  cup(174,181);cup(263,189);
  oval(215,185,9,3,'#bd9059');shape([[208,183],[209,169],[219,168],[223,183]],'#af895c');
  for(let i=0;i<13;i++){let x=204+rand()*24,y=147+rand()*20;shape([[214,172],[x,y],[x+1,y],[215,172]],'#7f8252');oval(x,y,3,2,i%2?'#b36842':'#d69954');}
  for(const [x,y,h] of [[240,177,14],[253,166,15]]){box(x-4,y,9,h,'#d7a257');box(x-3,y,7,2,'#fbe0a3');box(x,y-4,1,4,'#fff0b4');}
  return canvas;
}
