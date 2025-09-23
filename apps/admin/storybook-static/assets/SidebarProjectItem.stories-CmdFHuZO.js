import{j as a}from"./iframe-BQqEPkXj.js";import{S as s}from"./index-B5g2QZoj.js";import"./preload-helper-D9Z9MdNV.js";import"./index-CqALXU3L.js";const d={title:"Molecules/Sidebar/SidebarProjectItem",component:s,decorators:[t=>a.jsx("div",{className:"w-64 p-4 bg-base-200 rounded-box",children:a.jsx(t,{})})],args:{project:{id:"proj-1",name:"Acme Project",status:"Active"},active:!1},parameters:{docs:{description:{component:"Single project row used inside project dropdown listing."}}}},e={},r={args:{active:!0}},o={args:{project:{id:"proj-long",name:"Very Long Project Name That Should Truncate Gracefully In The Sidebar UI Shell",status:"Provisioning"}}};e.parameters={...e.parameters,docs:{...e.parameters?.docs,source:{originalSource:"{}",...e.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    active: true
  }
}`,...r.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    project: {
      id: 'proj-long',
      name: 'Very Long Project Name That Should Truncate Gracefully In The Sidebar UI Shell',
      status: 'Provisioning'
    }
  }
}`,...o.parameters?.docs?.source}}};const p=["Default","Active","LongName"];export{r as Active,e as Default,o as LongName,p as __namedExportsOrder,d as default};
