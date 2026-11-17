const make=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function statisticsRows(stats,metadata){
  const board=stats.board,via=stats.vias,pads=stats.pads,components=stats.components;
  return [
    ["Board size",`${board.width} × ${board.height} × ${board.board_thickness}`],
    ["Board area",board.area],["Footprints",components.total.total],
    ["SMT footprints",`${components.smd.total} (${components.smd.front} top / ${components.smd.back} bottom)`],
    ["Through-hole footprints",components.tht.total],["Other board features",components.unspecified.total],
    ["Through vias",via.through],["Blind vias",via.blind],["Buried vias",via.buried],["Microvias",via.micro],
    ["SMT / plated-through / NPTH pads",`${pads.smd} / ${pads.through_hole} / ${pads.npth}`],
    ["Minimum track width",board.min_track_width],["Minimum measured clearance",board.min_track_clearance],
    ["Smallest drill",board.min_drill_diameter],["Top / bottom copper area",`${board.front_copper_area} / ${board.back_copper_area}`],
    ...(metadata?[["Straight track objects",metadata.routing.segmentObjects],["Arc track objects",metadata.routing.arcObjects],["Straight track length",`${metadata.routing.straightTrackLengthMm.toFixed(1)} mm`]]:[])
  ];
}
export function renderStatistics(container,stats,metadata){
  container.replaceChildren();
  for(const [label,value] of statisticsRows(stats,metadata)){
    const card=make("div","");card.className="stat-card";card.append(make("dt",label),make("dd",String(value)));container.append(card);
  }
  const table=document.getElementById("drill-table-body");table.replaceChildren();
  for(const hole of stats.drill_holes){const row=document.createElement("tr");for(const value of [hole.count,hole.source,hole.shape,`${hole.x_size} × ${hole.y_size}`,hole.plated?"Plated":"Non-plated",`${hole.start_layer} → ${hole.stop_layer}`])row.append(make("td",value));table.append(row);}
}
