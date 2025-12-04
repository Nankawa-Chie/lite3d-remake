import React from "react";
import "./styles/AxesLegend.css";

export default function AxesLegend(){
  return (
    <div className="axes-legend">
      <div className="row"><span className="x" /> X 右(+)/左(-) 红</div>
      <div className="row"><span className="y" /> Y 上(+)/下(-) 绿</div>
      <div className="row"><span className="z" /> Z 前(-)/后(+) 蓝</div>
    </div>
  );
}
