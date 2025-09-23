import{j as e}from"./iframe-BQqEPkXj.js";import{S as i}from"./index-BKx0i3hD.js";import{S as r}from"./index-Bk3soyip.js";import"./preload-helper-D9Z9MdNV.js";import"./index-DkNetPqX.js";import"./index-CqALXU3L.js";const u={title:"Organisms/Sidebar/SidebarSection",component:i,parameters:{layout:"fullscreen",location:"/admin/documents"}},n=e.jsxs(e.Fragment,{children:[e.jsx(r,{id:"docs",icon:"lucide--file-text",url:"/admin/documents",children:"Documents"}),e.jsx(r,{id:"chat",icon:"lucide--message-square",url:"/admin/apps/chat",children:"AI Chat"}),e.jsx(r,{id:"settings",icon:"lucide--settings",url:"/admin/settings",children:"Settings"})]}),t={args:{title:"General",children:n}},a={name:"Externally Managed Activation",args:{title:"General",activated:new Set(["docs"]),children:n}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'General',
    children: items
  }
}`,...t.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  name: 'Externally Managed Activation',
  args: {
    title: 'General',
    activated: new Set(['docs']),
    children: items
  }
}`,...a.parameters?.docs?.source}}};const p=["Default","WithActivatedExternal"];export{t as Default,a as WithActivatedExternal,p as __namedExportsOrder,u as default};
