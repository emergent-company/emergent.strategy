import{j as e}from"./iframe-BQqEPkXj.js";import{S as t}from"./Sidebar-DyvLjWAp.js";import"./index-BKx0i3hD.js";import"./preload-helper-D9Z9MdNV.js";import"./index-Cdt7tlWj.js";import"./index-CypjT-PP.js";import"./index-CqALXU3L.js";import"./index-Bk3soyip.js";import"./index-DkNetPqX.js";import"./index-BPe7-S1f.js";import"./index-B5g2QZoj.js";const o=({children:i})=>e.jsx("div",{className:"bg-base-200 border border-base-300 rounded-box w-[280px] p-4 space-y-4 text-sm",children:i}),M={title:"Layout/Sidebar/Section",component:t.Section,decorators:[i=>e.jsx(o,{children:e.jsx(i,{})})],parameters:{docs:{description:{component:"`<Sidebar.Section>` isolated stories – only the section wrapper and its MenuItems. Full sidebar integration lives elsewhere."}}}},n={render:()=>e.jsxs(t.Section,{title:"Overview",activated:new Set,children:[e.jsx(t.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(t.MenuItem,{id:"chunks",url:"/admin/chunks",icon:"lucide--square-stack",children:"Chunks"})]})},a={render:()=>e.jsxs(t.Section,{activated:new Set,children:[e.jsx(t.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(t.MenuItem,{id:"chat",url:"/admin/chat",icon:"lucide--message-square",children:"Chat"})]})},s={render:()=>e.jsx("div",{className:"h-64 overflow-y-auto pr-2",children:e.jsx(t.Section,{title:"Large Set",activated:new Set,children:Array.from({length:15}).map((i,r)=>e.jsxs(t.MenuItem,{id:`item-${r}`,url:`/admin/it/${r}`,icon:"lucide--dot",children:["Item ",r+1]},r))})})};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar.Section title="Overview" activated={new Set<string>()}> 
      <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">Documents</Sidebar.MenuItem>
      <Sidebar.MenuItem id="chunks" url="/admin/chunks" icon="lucide--square-stack">Chunks</Sidebar.MenuItem>
    </Sidebar.Section>
}`,...n.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar.Section activated={new Set<string>()}>
      <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">Documents</Sidebar.MenuItem>
      <Sidebar.MenuItem id="chat" url="/admin/chat" icon="lucide--message-square">Chat</Sidebar.MenuItem>
    </Sidebar.Section>
}`,...a.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className="h-64 overflow-y-auto pr-2">
      <Sidebar.Section title="Large Set" activated={new Set<string>()}>
        {Array.from({
        length: 15
      }).map((_, i) => <Sidebar.MenuItem key={i} id={\`item-\${i}\`} url={\`/admin/it/\${i}\`} icon="lucide--dot">
            Item {i + 1}
          </Sidebar.MenuItem>)}
      </Sidebar.Section>
    </div>
}`,...s.parameters?.docs?.source}}};const v=["Basic","WithoutTitle","ManyItemsScrollable"];export{n as Basic,s as ManyItemsScrollable,a as WithoutTitle,v as __namedExportsOrder,M as default};
