var e=e=>URL.createObjectURL(new Blob([e],{type:`text/javascript`})),t=e=>`const real = globalThis.fetch
globalThis.fetch = (input, init) =>
  real(typeof input === 'string' ? new URL(input, ${JSON.stringify(e)}).href : input, init)
`,n=(n,r)=>`import ${JSON.stringify(e(t(r)))}
import ${JSON.stringify(r)}
const channel = new BroadcastChannel(${JSON.stringify(n)})
const from = ${JSON.stringify(r)}
new PerformanceObserver((list) => channel.postMessage(list.getEntries().map((e) => ({
  name: e.name, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, from
})))).observe({ type: 'resource', buffered: true })
`;function r(){let t=[],r=[],i=`inkbar-requests-${Math.random().toString(36).slice(2)}`,a=new BroadcastChannel(i);a.onmessage=e=>void t.push(...e.data);let o=new PerformanceObserver(e=>{for(let n of e.getEntries())t.push({name:n.name,transferSize:n.transferSize,encodedBodySize:n.encodedBodySize,from:`page`})});o.observe({type:`resource`});let s=globalThis.Worker;class c extends s{constructor(t,a){let o=new URL(String(t),location.href).href;r.push(o),super(a?.type===`module`?e(n(i,o)):t,a)}}return globalThis.Worker=c,{list:()=>[...t],workers:()=>[...r],stop(){globalThis.Worker===c&&(globalThis.Worker=s),o.disconnect(),a.close()}}}export{r as t};