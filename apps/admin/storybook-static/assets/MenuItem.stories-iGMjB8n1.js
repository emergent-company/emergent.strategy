import{j as e}from"./iframe-BQqEPkXj.js";import{S as t}from"./Sidebar-DyvLjWAp.js";import"./index-BKx0i3hD.js";import"./preload-helper-D9Z9MdNV.js";import"./index-Cdt7tlWj.js";import"./index-CypjT-PP.js";import"./index-CqALXU3L.js";import"./index-Bk3soyip.js";import"./index-DkNetPqX.js";import"./index-BPe7-S1f.js";import"./index-B5g2QZoj.js";const c=({children:d})=>e.jsx("div",{className:"bg-base-200 border border-base-300 rounded-box w-[260px] p-3 space-y-3 text-sm",children:d}),v={title:"Layout/Sidebar/MenuItem",component:t.MenuItem,decorators:[d=>e.jsx(c,{children:e.jsx(d,{})})],parameters:{docs:{description:{component:"`<Sidebar.MenuItem>` isolated stories render only the item (and nested items if collapsible). No full Sidebar shell here; integration examples live in root Sidebar stories."}}}},r={render:()=>e.jsx(t.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"})},i={name:"Active (selected)",render:()=>e.jsx(t.MenuItem,{id:"chat",url:"/admin/chat",icon:"lucide--message-square",activated:new Set(["chat"]),children:"Chat"})},a={render:()=>e.jsx(t.MenuItem,{id:"alerts",url:"/admin/alerts",icon:"lucide--bell",badges:["new","beta"],children:"Alerts"})},s={render:()=>e.jsxs(t.MenuItem,{id:"reports",icon:"lucide--chart-pie",collapsible:!0,activated:new Set(["reports"]),onToggleActivated:()=>{},children:["Reports",e.jsx(t.MenuItem,{id:"rep-daily",url:"/admin/reports/daily",icon:"lucide--sunrise",children:"Daily"}),e.jsx(t.MenuItem,{id:"rep-monthly",url:"/admin/reports/monthly",icon:"lucide--calendar",children:"Monthly"})]})},n={render:()=>e.jsxs(t.MenuItem,{id:"analytics",icon:"lucide--bar-chart-3",collapsible:!0,activated:new Set(["analytics","analytics-traffic"]),onToggleActivated:()=>{},children:["Analytics",e.jsxs(t.MenuItem,{id:"analytics-traffic",icon:"lucide--activity",collapsible:!0,children:["Traffic",e.jsx(t.MenuItem,{id:"analytics-traffic-live",url:"/admin/analytics/live",icon:"lucide--radio",children:"Live"})]})]}),parameters:{docs:{description:{story:"Multi-level nesting demonstrated with manually supplied activated set."}}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">Documents</Sidebar.MenuItem>
}`,...r.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  name: "Active (selected)",
  render: () => <Sidebar.MenuItem id="chat" url="/admin/chat" icon="lucide--message-square" activated={new Set(['chat'])}>Chat</Sidebar.MenuItem>
}`,...i.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar.MenuItem id="alerts" url="/admin/alerts" icon="lucide--bell" badges={["new", "beta"]}>Alerts</Sidebar.MenuItem>
}`,...a.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar.MenuItem id="reports" icon="lucide--chart-pie" collapsible activated={new Set(['reports'])} onToggleActivated={() => {}}>
      Reports
      <Sidebar.MenuItem id="rep-daily" url="/admin/reports/daily" icon="lucide--sunrise">Daily</Sidebar.MenuItem>
      <Sidebar.MenuItem id="rep-monthly" url="/admin/reports/monthly" icon="lucide--calendar">Monthly</Sidebar.MenuItem>
    </Sidebar.MenuItem>
}`,...s.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar.MenuItem id="analytics" icon="lucide--bar-chart-3" collapsible activated={new Set(['analytics', 'analytics-traffic'])} onToggleActivated={() => {}}>
      Analytics
      <Sidebar.MenuItem id="analytics-traffic" icon="lucide--activity" collapsible>
        Traffic
        <Sidebar.MenuItem id="analytics-traffic-live" url="/admin/analytics/live" icon="lucide--radio">Live</Sidebar.MenuItem>
      </Sidebar.MenuItem>
    </Sidebar.MenuItem>,
  parameters: {
    docs: {
      description: {
        story: "Multi-level nesting demonstrated with manually supplied activated set."
      }
    }
  }
}`,...n.parameters?.docs?.source}}};const f=["Default","Active","WithBadges","Collapsible","DeepNested"];export{i as Active,s as Collapsible,n as DeepNested,r as Default,a as WithBadges,f as __namedExportsOrder,v as default};
