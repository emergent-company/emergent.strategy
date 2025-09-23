import{j as e,M as n}from"./iframe-BQqEPkXj.js";import{S as d}from"./index-Cdt7tlWj.js";import{S as t}from"./index-BKx0i3hD.js";import{S as i}from"./index-Bk3soyip.js";import{S as o}from"./index-BPe7-S1f.js";import"./preload-helper-D9Z9MdNV.js";import"./index-CypjT-PP.js";import"./index-CqALXU3L.js";import"./index-DkNetPqX.js";import"./index-B5g2QZoj.js";const h={title:"Organisms/Sidebar/CompleteExample",component:d,decorators:[a=>e.jsx(n,{initialEntries:["/admin/documents"],children:e.jsx("div",{className:"w-72 h-[600px] border border-base-300 rounded-box overflow-hidden",children:e.jsx(a,{})})})],parameters:{docs:{description:{component:"Composed Sidebar organism using atomic-layer sections, menu items, and project dropdown."}}}},r={render:()=>e.jsxs(d,{children:[e.jsx(o,{projects:[{id:"p-1",name:"Core API",status:"active"},{id:"p-2",name:"Indexer",status:"paused"}],activeProjectId:"p-1",onSelectProject:()=>{},loading:!1}),e.jsxs(t,{title:"General",children:[e.jsx(i,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(i,{id:"settings",url:"/admin/settings",icon:"lucide--settings",children:"Settings"})]}),e.jsx(t,{title:"Collapsible",children:e.jsxs(i,{id:"parent",icon:"lucide--folder",collapsible:!0,children:["Parent",e.jsx(i,{id:"child-a",url:"/admin/a",children:"Child A"}),e.jsx(i,{id:"child-b",url:"/admin/b",children:"Child B"})]})})]})};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
      <SidebarProjectDropdown projects={[{
      id: 'p-1',
      name: 'Core API',
      status: 'active'
    }, {
      id: 'p-2',
      name: 'Indexer',
      status: 'paused'
    }]} activeProjectId="p-1" onSelectProject={() => {}} loading={false} />
      <SidebarSection title="General">
        <SidebarMenuItem id="documents" url="/admin/documents" icon="lucide--file-text">Documents</SidebarMenuItem>
        <SidebarMenuItem id="settings" url="/admin/settings" icon="lucide--settings">Settings</SidebarMenuItem>
      </SidebarSection>
      <SidebarSection title="Collapsible">
        <SidebarMenuItem id="parent" icon="lucide--folder" collapsible>
          Parent
          <SidebarMenuItem id="child-a" url="/admin/a">Child A</SidebarMenuItem>
          <SidebarMenuItem id="child-b" url="/admin/b">Child B</SidebarMenuItem>
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
}`,...r.parameters?.docs?.source}}};const I=["Default"];export{r as Default,I as __namedExportsOrder,h as default};
