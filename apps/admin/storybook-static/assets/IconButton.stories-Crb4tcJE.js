import{j as a}from"./iframe-BQqEPkXj.js";import{I as s}from"./index-wSADcztn.js";import{I as t}from"./index-CqALXU3L.js";import"./preload-helper-D9Z9MdNV.js";const m={title:"Molecules/IconButton",component:s,args:{"aria-label":"Settings"},parameters:{docs:{description:{component:"Molecule for square icon-only actions. Wraps a button with size + ghost styles. Provide accessible aria-label."}}}},n={render:e=>a.jsx(s,{...e,children:a.jsx(t,{icon:"lucide--settings",className:"size-4",ariaLabel:""})})},r={render:e=>a.jsxs("div",{className:"flex gap-4",children:[a.jsx(s,{...e,children:a.jsx(t,{icon:"lucide--bell",className:"size-4",ariaLabel:""})}),a.jsx(s,{...e,className:"btn btn-sm btn-primary btn-circle","aria-label":"Star",children:a.jsx(t,{icon:"lucide--star",className:"size-4",ariaLabel:""})}),a.jsx(s,{...e,className:"btn btn-sm btn-accent btn-circle","aria-label":"Heart",children:a.jsx(t,{icon:"lucide--heart",className:"size-4",ariaLabel:""})})]})};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: (args: IconButtonProps) => <IconButton {...args}>
      <Icon icon="lucide--settings" className="size-4" ariaLabel="" />
    </IconButton>
}`,...n.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  render: (args: IconButtonProps) => <div className="flex gap-4">
      <IconButton {...args}>
        <Icon icon="lucide--bell" className="size-4" ariaLabel="" />
      </IconButton>
      <IconButton {...args} className="btn btn-sm btn-primary btn-circle" aria-label="Star">
        <Icon icon="lucide--star" className="size-4" ariaLabel="" />
      </IconButton>
      <IconButton {...args} className="btn btn-sm btn-accent btn-circle" aria-label="Heart">
        <Icon icon="lucide--heart" className="size-4" ariaLabel="" />
      </IconButton>
    </div>
}`,...r.parameters?.docs?.source}}};const b=["Default","Variants"];export{n as Default,r as Variants,b as __namedExportsOrder,m as default};
