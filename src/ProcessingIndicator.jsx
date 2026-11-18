import React from 'react';
export function ProcessingIndicator({label='處理中',compact=false}){
 return <span className={`tw-processing ${compact?'compact':''}`} role="status" aria-label={label} title={label}>
  <span className="tw-processing-orbit" aria-hidden="true"/>
  {!compact&&<span>{label}<span className="tw-processing-dots" aria-hidden="true"><i/><i/><i/></span></span>}
 </span>;
}
