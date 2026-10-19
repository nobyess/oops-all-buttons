// Rotate artwork inside an unchanged control boundary; Spin remains on its parent.
export const quarterRotation=value=>((Math.round((Number(value)||0)/90)%4)+4)%4*90;
export function rotateArtwork(control){control.artworkRotation=(quarterRotation(control.artworkRotation)+90)%360;}
export function positionArtwork(element,control){
 const angle=quarterRotation(control.artworkRotation),odd=angle%180!==0;
 const width=Math.max(1,Number(control.width)||1),height=Math.max(1,Number(control.height)||1);
 Object.assign(element.style,{position:'absolute',left:'50%',top:'50%',width:(odd?height:width)+'px',height:(odd?width:height)+'px',transformOrigin:'50% 50%',transform:`translate(-50%, -50%) rotate(${angle}deg)`});
}
