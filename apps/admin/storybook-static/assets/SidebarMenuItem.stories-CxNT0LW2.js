import{j as e}from"./iframe-BQqEPkXj.js";import{S as o}from"./index-Bk3soyip.js";import"./preload-helper-D9Z9MdNV.js";import"./index-DkNetPqX.js";import"./index-CqALXU3L.js";const g={title:"Molecules/Sidebar/SidebarMenuItem",component:o,decorators:[s=>e.jsx("div",{className:"w-64 p-4 bg-base-200 rounded-box",children:e.jsx(s,{})})],args:{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents",activated:new Set(["documents"])},parameters:{docs:{description:{component:"Standalone SidebarMenuItem molecule. Demonstrates default, active, nested (collapsible) and badge variants without requiring the full Sidebar root."}}}},r={},a={args:{activated:new Set}},t={args:{badges:["new"]}},i={args:{id:"parent",icon:"lucide--folder",children:["Parent Item",e.jsx(o,{id:"child-a",url:"/admin/a",children:"Child A"},"child-a"),e.jsx(o,{id:"child-b",url:"/admin/b",children:"Child B"},"child-b")],collapsible:!0,activated:new Set(["parent","child-b"])}},d={args:{id:"toggle-parent",collapsible:!0,children:["Toggle Parent",e.jsx(o,{id:"child-c",url:"/admin/c",children:"Child C"},"child-c")],onToggleActivated:s=>alert(`Toggled: ${s}`),activated:new Set(["toggle-parent"])},parameters:{docs:{description:{story:"Shows how onToggleActivated is invoked for collapsible parents."}}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:"{}",...r.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    activated: new Set<string>()
  }
}`,...a.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    badges: ['new']
  }
}`,...t.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  args: {
    id: 'parent',
    icon: 'lucide--folder',
    children: ['Parent Item', <SidebarMenuItem key="child-a" id="child-a" url="/admin/a" children="Child A" />, <SidebarMenuItem key="child-b" id="child-b" url="/admin/b" children="Child B" />],
    collapsible: true,
    activated: new Set<string>(['parent', 'child-b'])
  }
}`,...i.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    id: 'toggle-parent',
    collapsible: true,
    children: ['Toggle Parent', <SidebarMenuItem key="child-c" id="child-c" url="/admin/c" children="Child C" />],
    onToggleActivated: (key: string) => alert(\`Toggled: \${key}\`),
    activated: new Set<string>(['toggle-parent'])
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows how onToggleActivated is invoked for collapsible parents.'
      }
    }
  }
}`,...d.parameters?.docs?.source}}};const u=["Default","Inactive","WithBadges","CollapsibleWithChildren","WithToggleHandler"];export{i as CollapsibleWithChildren,r as Default,a as Inactive,t as WithBadges,d as WithToggleHandler,u as __namedExportsOrder,g as default};
